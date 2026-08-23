import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { toRateInt, toRateNum } from "../common/money";

@Injectable()
export class RatesService {
  constructor(private prisma: PrismaService) {}

  // Tasa del día (o de una fecha específica). Si no hay histórico real, se
  // devuelve la más reciente (fallback a la de hoy), igual que el backend previo.
  async effective(date?: string) {
    const target = date || this.today();
    const row = await this.prisma.dailyRate.findUnique({ where: { date: target } });
    if (row) {
      return { date: row.date, vps: { bcv: toRateNum(row.bcv), paralelo: toRateNum(row.paralelo) } };
    }
    // fallback: la más reciente
    const latest = await this.prisma.dailyRate.findFirst({ orderBy: { date: "desc" } });
    if (latest) {
      return {
        date: latest.date,
        vps: { bcv: toRateNum(latest.bcv), paralelo: toRateNum(latest.paralelo) },
        note: "fallback a la tasa más reciente",
      };
    }
    throw new BadRequestException("No hay tasas disponibles");
  }

  async list() {
    const rows = await this.prisma.dailyRate.findMany({
      orderBy: { date: "desc" },
      take: 60,
    });
    return rows.map((r) => ({
      date: r.date,
      bcv: toRateNum(r.bcv),
      paralelo: toRateNum(r.paralelo),
      source: r.source,
    }));
  }

  async upsert(dto: { date: string; bcv: number; paralelo: number; source?: string }) {
    return this.prisma.dailyRate.upsert({
      where: { date: dto.date },
      update: {
        bcv: toRateInt(dto.bcv),
        paralelo: toRateInt(dto.paralelo),
        source: dto.source || "manual",
      },
      create: {
        date: dto.date,
        bcv: toRateInt(dto.bcv),
        paralelo: toRateInt(dto.paralelo),
        source: dto.source || "manual",
      },
    });
  }

  // detalle por id (GET /api/daily-rates/:id)
  async getById(id: number) {
    const row = await this.prisma.dailyRate.findUnique({ where: { id } });
    if (!row) throw new Error("Tasa no encontrada");
    return {
      id: row.id,
      date: row.date,
      bcv: toRateNum(row.bcv),
      paralelo: toRateNum(row.paralelo),
      source: row.source,
    };
  }

  // actualizar por id
  async updateById(
    id: number,
    dto: { bcv?: number; paralelo?: number; source?: string },
  ) {
    const existing = await this.prisma.dailyRate.findUnique({ where: { id } });
    if (!existing) throw new Error("Tasa no encontrada");
    const data: any = {};
    if (dto.bcv !== undefined) data.bcv = toRateInt(dto.bcv);
    if (dto.paralelo !== undefined) data.paralelo = toRateInt(dto.paralelo);
    if (dto.source !== undefined) data.source = dto.source;
    return this.prisma.dailyRate.update({ where: { id }, data });
  }

  async deleteById(id: number) {
    const existing = await this.prisma.dailyRate.findUnique({ where: { id } });
    if (!existing) throw new Error("Tasa no encontrada");
    await this.prisma.dailyRate.delete({ where: { id } });
    return { success: true };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
