import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "../categories/categories.service";
import { toInt, toNum } from "../common/money";
import { isValidTimeZone, toUtcInstant } from "../common/timezone";

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
  ) {}

  private timezone() {
    return "America/Caracas";
  }

  // Crea una transacción (opcional con fee inline). Atómica: padre + fee en un
  // solo $transaction, y balance actualizado al final. Replica la lógica de
  // createTransaction del backend original.
  async create(dto: {
    walletId: number;
    categoryName: string;
    type: "income" | "expense";
    amount: number; // unidades
    description?: string;
    fee?: number; // unidades
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    tz?: string;
  }) {
    const {
      walletId,
      categoryName,
      type,
      amount,
      description,
      fee = 0,
      date,
      time,
      tz = this.timezone(),
    } = dto;

    const amountInt = toInt(amount);
    const commission = toInt(fee || 0);
    const datetimeUtc = toUtcInstant(date, time, tz);

    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, isActive: true },
    });
    if (!wallet) throw new BadRequestException("Wallet no encontrada");

    const category = await this.categories.getOrCreateCategory(
      categoryName,
      type,
    );

    const total = amountInt + commission;
    if (type === "expense" && wallet.balance < total) {
      throw new BadRequestException(
        `Fondos insuficientes. Balance actual: ${toNum(wallet.balance)} ${
          wallet.currency
        }, necesita ${toNum(total)}`,
      );
    }

    const newBalance =
      type === "expense"
        ? wallet.balance - total
        : wallet.balance + amountInt - commission;

    // Transacción atómica: inserta padre (+ fee) y actualiza balance.
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          walletId,
          categoryId: category!.id,
          type,
          amount: amountInt,
          description: description || "",
          datetimeUtc,
          fee: 0,
          parentId: null,
        },
      });

      let feeTransactionId: number | null = null;
      if (commission > 0) {
        const feeCategory = await tx.category.findFirst({
          where: { name: "fee", type: "expense", isActive: true },
        });
        const fc = feeCategory ? feeCategory.id : category!.id;
        const side =
          categoryName === "exchange_out"
            ? " débito"
            : categoryName === "exchange_in"
              ? " crédito"
              : "";
        const feeTx = await tx.transaction.create({
          data: {
            walletId,
            categoryId: fc,
            type: "expense" as const,
            amount: commission,
            description: `Comisión${side}: ${description || category!.name}`,
            datetimeUtc,
            fee: 0,
            parentId: created.id,
          },
        });
        feeTransactionId = feeTx.id;
        // Sincroniza el fee denormalizado del padre
        await this.syncParentFee(tx, created.id);
      }

      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
      });

      return {
        id: created.id,
        feeTransactionId,
        wallet: wallet.name,
        currency: wallet.currency,
        amount: amountInt,
        type,
        newBalance,
        category: category!.name,
        fee: commission,
        datetime_utc: datetimeUtc,
      };
    });
  }

  // Recalcula transactions.fee del padre a partir de sus hijos fee.
  private async syncParentFee(tx: any, parentId: number) {
    const agg = await tx.transaction.aggregate({
      where: { parentId, category: { name: "fee" }, deleted: false },
      _sum: { amount: true },
    });
    const sum = agg._sum.amount || 0;
    await tx.transaction.update({
      where: { id: parentId },
      data: { fee: sum },
    });
  }

  // Lista transacciones con filtros de rango y paginación (proyecta a tz).
  async list(query: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    walletId?: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 20, 1), 100);
    const offset = (page - 1) * limit;
    const tz = this.timezone();

    const where: any = { deleted: false };
    if (query.walletId) where.walletId = query.walletId;
    if (query.from || query.to) {
      where.datetimeUtc = {};
      if (query.from)
        where.datetimeUtc.gte = toUtcInstant(
          query.from,
          "00:00",
          tz,
        );
      if (query.to)
        where.datetimeUtc.lt = toUtcInstant(query.to, "00:00", tz);
    }

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { wallet: true, category: true },
        orderBy: [{ datetimeUtc: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.projected(r, tz)),
      total,
      page,
      limit,
      tz,
    };
  }

  private projected(row: any, tz: string) {
    const { utcToWallClock } = require("../common/timezone");
    const wall = utcToWallClock(new Date(row.datetimeUtc), tz);
    return {
      id: row.id,
      walletId: row.walletId,
      walletName: row.wallet?.name,
      walletCurrency: row.wallet?.currency,
      category: row.category?.name,
      type: row.type,
      amount: toNum(row.amount),
      description: row.description,
      datetimeUtc: row.datetimeUtc,
      fee: row.fee != null ? toNum(row.fee) : 0,
      parentTransactionId: row.parentId,
      date: wall.date,
      time: wall.time,
    };
  }

  async detail(id: number, tz: string = this.timezone()) {
    const t = await this.prisma.transaction.findFirst({
      where: { id, deleted: false },
      include: { wallet: true, category: true, children: true },
    });
    if (!t) throw new NotFoundException("Transacción no encontrada");
    return this.projected(t, tz);
  }

  async update(
    id: number,
    dto: {
      description?: string;
      amount?: number;
      date?: string;
      time?: string;
      categoryName?: string;
      tz?: string;
    },
  ) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t || t.deleted) throw new NotFoundException("Transacción no encontrada");

    const tz = dto.tz || this.timezone();
    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined)
      data.amount = toInt(Number(dto.amount));
    if (dto.categoryName !== undefined) {
      const cat = await this.categories.getOrCreateCategory(
        dto.categoryName,
        t.type,
      );
      data.categoryId = cat!.id;
    }
    if (dto.date && dto.time) {
      data.datetimeUtc = toUtcInstant(dto.date, dto.time, tz);
    }
    return this.prisma.transaction.update({ where: { id }, data });
  }

  async remove(id: number) {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t || t.deleted) throw new NotFoundException("Transacción no encontrada");
    return this.prisma.transaction.update({ where: { id }, data: { deleted: true } });
  }

  // Agrega comisión (fee) como hija de una transacción existente.
  async addFee(
    id: number,
    dto: { amount: number; date: string; time: string; tz?: string },
  ) {
    const t = await this.prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true, category: true },
    });
    if (!t || t.deleted) throw new NotFoundException("Transacción no encontrada");
    if (t.category?.name === "fee") {
      throw new BadRequestException(
        "No puedes agregar comisión a una comisión (fee).",
      );
    }
    const tz = dto.tz || this.timezone();
    const feeAmount = toInt(dto.amount);
    const datetimeUtc = toUtcInstant(dto.date, dto.time, tz);

    const wallet = await this.prisma.wallet.findUnique({
      where: { id: t.walletId },
    });
    if (!wallet) throw new NotFoundException("Billetera no encontrada");

    const feeCategory = await this.prisma.category.findFirst({
      where: { name: "fee", type: "expense", isActive: true },
    });
    if (!feeCategory)
      throw new BadRequestException("Categoría fee no disponible");

    if (wallet.balance < feeAmount) {
      throw new BadRequestException(
        `Fondos insuficientes. Balance actual: ${toNum(wallet.balance)} ${
          wallet.currency
        }, necesita ${toNum(feeAmount)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const feeTx = await tx.transaction.create({
        data: {
          walletId: t.walletId,
          categoryId: feeCategory.id,
          type: "expense",
          amount: feeAmount,
          description: `Comisión: ${t.description || ""}`.trim(),
          datetimeUtc,
          fee: 0,
          parentId: id,
        },
      });
      await tx.wallet.update({
        where: { id: t.walletId },
        data: { balance: wallet.balance - feeAmount },
      });
      await this.syncParentFee(tx, id);
      return { success: true, feeId: feeTx.id };
    });
  }

  // Crea una transacción asociada (hija) de un padre.
  async associate(
    id: number,
    dto: {
      amount: number;
      type: "income" | "expense";
      categoryName: string;
      description?: string;
      date: string;
      time: string;
      tz?: string;
    },
  ) {
    const t = await this.prisma.transaction.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!t || t.deleted) throw new NotFoundException("Transacción no encontrada");

    const tz = dto.tz || this.timezone();
    const amountInt = toInt(dto.amount);
    const datetimeUtc = toUtcInstant(dto.date, dto.time, tz);
    const category = await this.categories.getOrCreateCategory(
      dto.categoryName,
      dto.type,
    );

    const wallet = await this.prisma.wallet.findUnique({
      where: { id: t.walletId },
    });
    if (!wallet) throw new NotFoundException("Billetera no encontrada");

    const effect = dto.type === "income" ? amountInt : -amountInt;
    if (effect < 0 && wallet.balance < amountInt) {
      throw new BadRequestException(
        `Fondos insuficientes. Balance actual: ${toNum(wallet.balance)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const child = await tx.transaction.create({
        data: {
          walletId: t.walletId,
          categoryId: category!.id,
          type: dto.type,
          amount: amountInt,
          description: dto.description || "",
          datetimeUtc,
          fee: 0,
          parentId: id,
        },
      });
      await tx.wallet.update({
        where: { id: t.walletId },
        data: { balance: wallet.balance + effect },
      });
      return { success: true, associateId: child.id };
    });
  }
}
