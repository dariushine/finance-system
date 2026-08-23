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

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
