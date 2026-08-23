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
}
