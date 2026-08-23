import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toInt, toNum, toRateInt } from "../common/money";
import { isValidTimeZone, toUtcInstant } from "../common/timezone";

@Injectable()
export class ExchangesService {
  constructor(private prisma: PrismaService) {}

  private timezone() {
    return "America/Caracas";
  }

  // Crea un exchange atómico: débito + crédito (+ fees) + registro del exchange
  // en UNA sola transacción Prisma. Si algo falla, se revierte todo.
  async create(dto: {
    fromWalletId: number;
    toWalletId: number;
    fromAmount: number;
    toAmount: number;
    description?: string;
    fee?: number;
    creditFee?: number;
    date: string;
    time: string;
    tz?: string;
  }) {
    const {
      fromWalletId,
      toWalletId,
      fromAmount,
      toAmount,
      description,
      fee = 0,
      creditFee = 0,
      date,
      time,
      tz = this.timezone(),
    } = dto;

    if (!fromWalletId || !toWalletId || !fromAmount || !toAmount) {
      throw new BadRequestException(
        "Faltan campos requeridos: fromWalletId, toWalletId, fromAmount, toAmount",
      );
    }
    if (fromWalletId === toWalletId) {
      throw new BadRequestException(
        "Las billeteras origen y destino deben ser diferentes",
      );
    }
    if (fromAmount <= 0 || toAmount <= 0) {
      throw new BadRequestException("Los montos deben ser mayores a 0");
    }
    if (!date || !time) {
      throw new BadRequestException(
        "La fecha (YYYY-MM-DD) y hora (HH:MM) son obligatorias",
      );
    }

    const datetimeUtc = toUtcInstant(date, time, tz);
    const fromAmountInt = toInt(fromAmount);
    const toAmountInt = toInt(toAmount);
    const commission = toInt(fee);
    const creditCommission = toInt(creditFee);
    const rate = toRateInt(toAmount / fromAmount);

    const fromWallet = await this.prisma.wallet.findFirst({
      where: { id: fromWalletId, isActive: true },
    });
    const toWallet = await this.prisma.wallet.findFirst({
      where: { id: toWalletId, isActive: true },
    });
    if (!fromWallet) throw new BadRequestException("Billetera origen no encontrada");
    if (!toWallet) throw new BadRequestException("Billetera destino no encontrada");

    const fromTotal = fromAmountInt + commission;
    if (fromWallet.balance < fromTotal) {
      throw new BadRequestException(
        `Fondos insuficientes en ${fromWallet.name}. Balance actual: ${toNum(
          fromWallet.balance,
        )} ${fromWallet.currency}, necesita ${toNum(fromTotal)}`,
      );
    }
    if (toWallet.balance + toAmountInt < creditCommission) {
      throw new BadRequestException(
        `Fondos insuficientes en ${toWallet.name}. Balance actual: ${toNum(
          toWallet.balance,
        )} ${toWallet.currency}, necesita ${toNum(creditCommission)}`,
      );
    }

    const debitWalletBalance = fromWallet.balance - fromAmountInt - commission;
    const creditWalletBalance =
      toWallet.balance + toAmountInt - creditCommission;

    const exchangeOut = await this.prisma.category.findFirst({
      where: { name: "exchange_out", type: "expense", isActive: true },
    });
    const exchangeIn = await this.prisma.category.findFirst({
      where: { name: "exchange_in", type: "income", isActive: true },
    });
    if (!exchangeOut || !exchangeIn) {
      throw new BadRequestException(
        "Faltan categorías de sistema (exchange_out/exchange_in)",
      );
    }
    const feeCategory = await this.prisma.category.findFirst({
      where: { name: "fee", type: "expense", isActive: true },
    });

    return this.prisma.$transaction(async (tx) => {
      // Débito (exchange_out) con su comisión
      const debit = await tx.transaction.create({
        data: {
          walletId: fromWalletId,
          categoryId: exchangeOut.id,
          type: "expense",
          amount: fromAmountInt,
          description: `${description || "Exchange"} → ${toWallet.name}`,
          datetimeUtc,
          fee: 0,
          parentId: null,
        },
      });
      let debitFeeTx: number | null = null;
      if (commission > 0 && feeCategory) {
        const feeTx = await tx.transaction.create({
          data: {
            walletId: fromWalletId,
            categoryId: feeCategory.id,
            type: "expense",
            amount: commission,
            description: `Comisión débito: ${description || "Exchange"} → ${
              toWallet.name
            }`,
            datetimeUtc,
            fee: 0,
            parentId: debit.id,
          },
        });
        debitFeeTx = feeTx.id;
        await this.syncParentFee(tx, debit.id);
      }

      // Crédito (exchange_in) con su comisión
      const credit = await tx.transaction.create({
        data: {
          walletId: toWalletId,
          categoryId: exchangeIn.id,
          type: "income",
          amount: toAmountInt,
          description: `${description || "Exchange"} ← ${fromWallet.name}`,
          datetimeUtc,
          fee: 0,
          parentId: null,
        },
      });
      let creditFeeTx: number | null = null;
      if (creditCommission > 0 && feeCategory) {
        const feeTx = await tx.transaction.create({
          data: {
            walletId: toWalletId,
            categoryId: feeCategory.id,
            type: "expense",
            amount: creditCommission,
            description: `Comisión crédito: ${description || "Exchange"} ← ${
              fromWallet.name
            }`,
            datetimeUtc,
            fee: 0,
            parentId: credit.id,
          },
        });
        creditFeeTx = feeTx.id;
        await this.syncParentFee(tx, credit.id);
      }

      // Registro del exchange
      const ex = await tx.exchange.create({
        data: {
          debitTransactionId: debit.id,
          creditTransactionId: credit.id,
          fromWalletId,
          toWalletId,
          fromAmount: fromAmountInt,
          toAmount: toAmountInt,
          rate,
          fee: commission,
          creditFee: creditCommission,
          description: description || "",
        },
      });

      // Balances
      await tx.wallet.update({
        where: { id: fromWalletId },
        data: { balance: debitWalletBalance },
      });
      await tx.wallet.update({
        where: { id: toWalletId },
        data: { balance: creditWalletBalance },
      });

      return {
        success: true,
        message: "Exchange registrado exitosamente",
        exchange: {
          id: ex.id,
          rate: Number(rate) / 10000,
          fromWallet: fromWallet.name,
          toWallet: toWallet.name,
          fromAmount: fromAmount,
          toAmount: toAmount,
          fromCurrency: fromWallet.currency,
          toCurrency: toWallet.currency,
          description: description || "",
        },
        transactions: {
          debit: { id: debit.id, feeTransactionId: debitFeeTx },
          credit: { id: credit.id, feeTransactionId: creditFeeTx },
        },
      };
    });
  }

  private async syncParentFee(tx: any, parentId: number) {
    const agg = await tx.transaction.aggregate({
      where: { parentId, category: { name: "fee" }, deleted: false },
      _sum: { amount: true },
    });
    await tx.transaction.update({
      where: { id: parentId },
      data: { fee: agg._sum.amount || 0 },
    });
  }

  async list(query: { page?: string; limit?: string }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const where: any = { deleted: false };
    const [rows, total] = await Promise.all([
      this.prisma.exchange.findMany({
        where,
        include: {
          debit: { include: { wallet: true } },
          credit: { include: { wallet: true } },
          from: true,
          to: true,
        },
        orderBy: [{ id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.exchange.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        fromWalletId: r.fromWalletId,
        toWalletId: r.toWalletId,
        fromAmount: toNum(r.fromAmount),
        toAmount: toNum(r.toAmount),
        rate: Number(r.rate) / 10000,
        fee: toNum(r.fee),
        creditFee: toNum(r.creditFee),
        description: r.description,
        createdAt: r.createdAt,
        debitTransactionId: r.debitTransactionId,
        creditTransactionId: r.creditTransactionId,
        fromWalletName: r.from.name,
        toWalletName: r.to.name,
        fromCurrency: r.from.currency,
        toCurrency: r.to.currency,
      })),
      total,
      page,
      limit,
    };
  }

  async detail(id: number) {
    const ex = await this.prisma.exchange.findFirst({
      where: { id, deleted: false },
      include: {
        from: true,
        to: true,
        debit: true,
        credit: true,
      },
    });
    if (!ex) throw new NotFoundException("Exchange no encontrado");
    return {
      id: ex.id,
      fromWalletId: ex.fromWalletId,
      toWalletId: ex.toWalletId,
      fromAmount: toNum(ex.fromAmount),
      toAmount: toNum(ex.toAmount),
      rate: Number(ex.rate) / 10000,
      fee: toNum(ex.fee),
      creditFee: toNum(ex.creditFee),
      description: ex.description,
      createdAt: ex.createdAt,
      fromWalletName: ex.from.name,
      toWalletName: ex.to.name,
      fromCurrency: ex.from.currency,
      toCurrency: ex.to.currency,
    };
  }

  async remove(id: number) {
    const ex = await this.prisma.exchange.findUnique({ where: { id } });
    if (!ex || ex.deleted) throw new NotFoundException("Exchange no encontrado");
    return this.prisma.exchange.update({
      where: { id },
      data: { deleted: true },
    });
  }
}
