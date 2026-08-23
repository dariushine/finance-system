import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toNum } from "../common/money";

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const [income, expense, count, wallets] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { deleted: false, type: "income" },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { deleted: false, type: "expense" },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({ where: { deleted: false } }),
      this.prisma.wallet.aggregate({
        where: { isActive: true },
        _sum: { balance: true },
      }),
    ]);

    const inc = income._sum.amount || 0;
    const exp = expense._sum.amount || 0;
    return {
      income: toNum(inc),
      expense: toNum(exp),
      net: toNum(inc - exp),
      transactionCount: count,
      walletBalance: toNum(wallets._sum.balance || 0),
    };
  }

  async byCategory() {
    // Agrupa por categoría sumando montos (income suma, expense resta del total).
    const grouped = await this.prisma.transaction.groupBy({
      by: ["categoryId", "type"],
      where: { deleted: false },
      _sum: { amount: true },
    });
    // Necesitamos los nombres de categorías.
    const cats = await this.prisma.category.findMany();
    const nameById = new Map(cats.map((c) => [c.id, c.name]));

    return grouped.map((g) => ({
      name: nameById.get(g.categoryId) || "sin categoría",
      type: g.type,
      total: toNum(g._sum.amount || 0),
    }));
  }
}
