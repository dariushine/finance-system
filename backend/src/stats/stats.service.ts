import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toNum } from "../common/money";

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const tx = await this.prisma.transaction.findMany({
      where: { deleted: false },
    });
    let income = 0;
    let expense = 0;
    for (const t of tx) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return {
      income: toNum(income),
      expense: toNum(expense),
      net: toNum(income - expense),
      transactionCount: tx.length,
    };
  }

  async byCategory() {
    const tx = await this.prisma.transaction.findMany({
      where: { deleted: false },
      include: { category: true },
    });
    const map = new Map<string, { name: string; type: string; total: number }>();
    for (const t of tx) {
      const name = t.category?.name || "sin categoría";
      const cur = map.get(name) || { name, type: t.type, total: 0 };
      cur.total += t.amount;
      map.set(name, cur);
    }
    return Array.from(map.values()).map((c) => ({
      name: c.name,
      type: c.type,
      total: toNum(c.total),
    }));
  }
}
