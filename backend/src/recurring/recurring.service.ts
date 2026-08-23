import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "../categories/categories.service";
import { TransactionsService } from "../transactions/transactions.service";
import { toInt, toNum } from "../common/money";

@Injectable()
export class RecurringService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
    private transactions: TransactionsService,
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
      throw new BadRequestException("name y amount son requeridos");
    }
    let categoryId = dto.categoryId;
    if (!categoryId && dto.categoryName) {
      const cat = await this.categories.getOrCreateCategory(
        dto.categoryName,
        dto.type,
      );
      categoryId = cat!.id;
    }
    if (!categoryId) throw new BadRequestException("Categoría requerida");
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
    if (!row) throw new NotFoundException("Pago recurrente no encontrado");
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
    if (!existing) throw new NotFoundException("Pago recurrente no encontrado");
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

  // Ejecuta un pago recurrente: delega en TransactionsService.create (DI limpia),
  // que maneja el fee inline y el balance atómicamente. Evita duplicar lógica.
  async execute(
    id: number,
    dto: {
      date: string;
      time: string;
      tz?: string;
      walletId?: number;
      overrideAmount?: number;
      overrideFee?: number;
      overrideCategoryName?: string;
      overrideWalletId?: number;
      description?: string;
    },
  ) {
    const row = await this.prisma.recurringPayment.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Pago recurrente no encontrado");
    // Overrides opcionales del front
    const walletId = dto.overrideWalletId ?? dto.walletId ?? row.walletId;
    if (!walletId)
      throw new BadRequestException("El pago recurrente no tiene billetera asignada");

    // Categoría efectiva: la del recurrente salvo que haya override por nombre
    let category = await this.prisma.category.findUnique({
      where: { id: row.categoryId },
    });
    if (dto.overrideCategoryName) {
      const cat = await this.categories.getOrCreateCategory(
        dto.overrideCategoryName,
        row.type,
      );
      category = cat;
    }
    if (!category) throw new NotFoundException("Categoría no encontrada");

    const amount = dto.overrideAmount != null ? toNum(dto.overrideAmount) : toNum(row.amount);
    const fee = dto.overrideFee != null ? toNum(dto.overrideFee) : toNum(row.fee);
    const description = dto.description?.trim() || row.description || row.name;

    const created = await this.transactions.create({
      walletId,
      categoryName: category.name,
      type: row.type as "income" | "expense",
      amount,
      description,
      fee,
      date: dto.date,
      time: dto.time,
      tz: dto.tz || "America/Caracas",
    });

    return {
      success: true,
      transactionId: created.id,
      feeTransactionId: created.feeTransactionId,
    };
  }
}
