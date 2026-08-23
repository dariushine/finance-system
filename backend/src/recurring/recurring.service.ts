import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "../categories/categories.service";
import { toInt, toNum } from "../common/money";

@Injectable()
export class RecurringService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
  ) {}

  async list() {
    const rows = await this.prisma.recurringPayment.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      amount: toNum(r.amount),
      fee: toNum(r.fee),
      currency: r.currency,
      type: r.type,
      category: r.category.name,
      categoryId: r.categoryId,
      walletId: r.walletId,
      isActive: r.isActive,
    }));
  }

  async create(dto: {
    name: string;
    description?: string;
    amount: number;
    fee?: number;
    currency: string;
    type: "income" | "expense";
    categoryName?: string;
    categoryId?: number;
    walletId?: number;
  }) {
    if (!dto.name || dto.amount == null) {
      throw new Error("name y amount son requeridos");
    }
    let categoryId = dto.categoryId;
    if (!categoryId && dto.categoryName) {
      const cat = await this.categories.getOrCreateCategory(
        dto.categoryName,
        dto.type,
      );
      categoryId = cat!.id;
    }
    if (!categoryId) throw new Error("Categoría requerida");
    const row = await this.prisma.recurringPayment.create({
      data: {
        name: dto.name,
        description: dto.description,
        amount: toInt(dto.amount),
        fee: toInt(dto.fee || 0),
        currency: dto.currency,
        type: dto.type,
        categoryId,
        walletId: dto.walletId,
      },
    });
    return row;
  }

  async remove(id: number) {
    return this.prisma.recurringPayment.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Detalle de un pago recurrente
  async detail(id: number) {
    const row = await this.prisma.recurringPayment.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!row) throw new Error("Pago recurrente no encontrado");
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      amount: toNum(row.amount),
      fee: toNum(row.fee),
      currency: row.currency,
      type: row.type,
      category: row.category?.name,
      categoryId: row.categoryId,
      walletId: row.walletId,
      isActive: row.isActive,
    };
  }

  // Editar un pago recurrente
  async update(
    id: number,
    dto: {
      name?: string;
      description?: string;
      amount?: number;
      fee?: number;
      currency?: string;
      type?: "income" | "expense";
      categoryName?: string;
      walletId?: number;
    },
  ) {
    const existing = await this.prisma.recurringPayment.findUnique({
      where: { id },
    });
    if (!existing) throw new Error("Pago recurrente no encontrado");
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined)
      data.description = dto.description;
    if (dto.amount !== undefined) data.amount = toInt(dto.amount);
    if (dto.fee !== undefined) data.fee = toInt(dto.fee);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.walletId !== undefined) data.walletId = dto.walletId;
    if (dto.categoryName !== undefined) {
      const cat = await this.categories.getOrCreateCategory(
        dto.categoryName,
        existing.type,
      );
      data.categoryId = cat!.id;
    }
    return this.prisma.recurringPayment.update({ where: { id }, data });
  }

  // Ejecuta un pago recurrente: crea la transacción real con su fee.
  async execute(
    id: number,
    dto: { date: string; time: string; tz?: string; walletId?: number },
  ) {
    const row = await this.prisma.recurringPayment.findUnique({
      where: { id },
    });
    if (!row) throw new Error("Pago recurrente no encontrado");
    const walletId = dto.walletId ?? row.walletId;
    if (!walletId)
      throw new Error("El pago recurrente no tiene billetera asignada");

    // Reusamos la creación de transacción con fee inline (misma lógica).
    const { TransactionsService } = await import(
      "../transactions/transactions.service"
    );
    // Llamada por inyección no disponible acá; creamos directo via prisma.
    const category = await this.prisma.category.findUnique({
      where: { id: row.categoryId },
    });
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet || !category)
      throw new Error("Billetera o categoría no encontrada");

    const amountInt = row.amount;
    const feeInt = row.fee;
    const total = amountInt + feeInt;
    if (row.type === "expense" && wallet.balance < total) {
      throw new Error(
        `Fondos insuficientes. Balance: ${toNum(wallet.balance)}`,
      );
    }
    const newBalance =
      row.type === "expense" ? wallet.balance - total : wallet.balance + amountInt - feeInt;
    const { toUtcInstant } = await import("../common/timezone");
    const datetimeUtc = toUtcInstant(
      dto.date,
      dto.time,
      dto.tz || "America/Caracas",
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          walletId,
          categoryId: row.categoryId,
          type: row.type as any,
          amount: amountInt,
          description: row.description || row.name,
          datetimeUtc,
          fee: 0,
          parentId: null,
        },
      });
      let feeTxId: number | null = null;
      if (feeInt > 0) {
        const feeCat = await tx.category.findFirst({
          where: { name: "fee", type: "expense" },
        });
        const feeTx = await tx.transaction.create({
          data: {
            walletId,
            categoryId: feeCat?.id || row.categoryId,
            type: "expense",
            amount: feeInt,
            description: `Comisión: ${row.name}`,
            datetimeUtc,
            fee: 0,
            parentId: created.id,
          },
        });
        feeTxId = feeTx.id;
      }
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
      });
      return {
        success: true,
        transactionId: created.id,
        feeTransactionId: feeTxId,
      };
    });
  }
}
