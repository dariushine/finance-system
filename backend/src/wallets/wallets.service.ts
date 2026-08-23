import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toInt, toNum } from "../common/money";

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const wallets = await this.prisma.wallet.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });
    return wallets.map((w) => ({ ...w, balance: toNum(w.balance) }));
  }

  async findById(id: number) {
    return this.prisma.wallet.findFirst({ where: { id, isActive: true } });
  }

  async create(dto: {
    name: string;
    type: string;
    currency: string;
    balance?: number;
    alias?: string;
    description?: string;
    icon?: string;
    color?: string;
  }) {
    const balanceUnits = dto.balance ?? 0;
    return this.prisma.wallet.create({
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        balance: toInt(balanceUnits),
        alias: dto.alias,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
      },
    });
  }

  async update(
    id: number,
    dto: {
      name?: string;
      balance?: number;
      alias?: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) {
    const existing = await this.findById(id);
    if (!existing) throw new BadRequestException("Billetera no encontrada");
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.alias !== undefined) data.alias = dto.alias;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.color !== undefined) data.color = dto.color;
    return this.prisma.wallet.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.findById(id);
    if (!existing) throw new BadRequestException("Billetera no encontrada");
    return this.prisma.wallet.update({ where: { id }, data: { isActive: false } });
  }
}
