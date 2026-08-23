import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BadRequestException } from "@nestjs/common";

const SYSTEM_CATEGORIES = ["fee", "exchange_out", "exchange_in"];

export function isSystemCategoryName(name?: string): boolean {
  return SYSTEM_CATEGORIES.includes(String(name || ""));
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // Busca una categoría activa por nombre+tipo; si no existe la crea
  // (idempotente). No permite crear categorías de sistema si faltan.
  async getOrCreateCategory(categoryName: string, type: string) {
    const name = String(categoryName || "").trim();
    if (!name) throw new BadRequestException("Nombre de categoría vacío");
    if (type !== "income" && type !== "expense") {
      throw new BadRequestException("type debe ser income o expense");
    }
    let row = await this.prisma.category.findFirst({
      where: { name, type },
    });
    if (row) {
      if (!row.isActive && !isSystemCategoryName(row.name)) {
        row = await this.prisma.category.update({
          where: { id: row.id },
          data: { isActive: true },
        });
      }
      return row;
    }
    if (isSystemCategoryName(name)) {
      throw new BadRequestException(
        `No puedes crear la categoría de sistema '${name}'`,
      );
    }
    const color = type === "income" ? "#2ecc71" : "#e74c3c";
    try {
      return await this.prisma.category.create({ data: { name, type, color } });
    } catch (e: any) {
      // carrera concurrente: reintentar lectura
      if (String(e?.message || "").includes("Unique")) {
        return await this.prisma.category.findFirst({
          where: { name, type },
        });
      }
      throw e;
    }
  }

  async list() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async create(dto: { name: string; type: string; color?: string }) {
    const { name, type } = dto;
    if (isSystemCategoryName(name)) {
      throw new BadRequestException(
        `No puedes crear la categoría de sistema '${name}'`,
      );
    }
    return this.getOrCreateCategory(name, type);
  }

  async update(id: number, dto: { name?: string; color?: string }) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException("Categoría no encontrada");
    if (isSystemCategoryName(existing.name) && dto.name) {
      throw new BadRequestException(
        "La categoría de sistema no se puede renombrar",
      );
    }
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException("Categoría no encontrada");
    if (isSystemCategoryName(existing.name)) {
      throw new BadRequestException(
        "La categoría de sistema no se puede eliminar",
      );
    }
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }
}
