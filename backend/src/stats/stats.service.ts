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
    const totalIncome = toNum(inc);
    const totalExpense = toNum(exp);
    const totalBalance = toNum(wallets._sum.balance || 0);
    const net = parseFloat((totalIncome - totalExpense).toFixed(2));

    // Contrato original del backend (el frontend lo consume así):
    // campos snake_case + objeto summary (camelCase).
    return {
      total_income: parseFloat(totalIncome.toFixed(2)),
      total_expense: parseFloat(totalExpense.toFixed(2)),
      net_balance: net,
      total_balance: totalBalance,
      transaction_count: count,
      summary: {
        totalTransactions: count,
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalExpenses: parseFloat(totalExpense.toFixed(2)),
        net: net,
        totalBalance,
      },
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
