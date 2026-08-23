import { createHash, randomUUID } from "crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  get authEnabled(): boolean {
    return Boolean(
      this.config.get<string>("AUTH_USERNAME") &&
        this.config.get<string>("AUTH_PASSWORD"),
    );
  }

  private sha(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  async login(
    username: string,
    password: string,
    remember: boolean,
    res: Response,
  ) {
    if (!this.authEnabled) {
      throw new UnauthorizedException("Autenticación deshabilitada");
    }
    const user = this.config.get<string>("AUTH_USERNAME");
    const pass = this.config.get<string>("AUTH_PASSWORD");
    if (username !== user || password !== pass) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const accessToken = await this.jwt.signAsync({ sub: username });
    const jti = randomUUID();
    const refreshSecret = randomUUID();
    const now = Date.now();
    // Number() explícito: ConfigService devuelve string aunque se tipifique
    // <number>. Sin esto, now + expiresMs concatenaba strings → expiresAt
    // gigante e inválido para Prisma (Int).
    const expiresMs = Number(
      this.config.get("REFRESH_EXPIRES_MS", 2592000000),
    );

    await this.prisma.refreshToken.create({
      data: {
        jti,
        tokenHash: this.sha(refreshSecret),
        createdAt: now,
        expiresAt: now + expiresMs,
      },
    });

    // Cookies httpOnly para que viajen solas (mismo-origin), como espera el front.
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie("refresh_token", refreshSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: expiresMs,
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: 15 * 60,
      remember,
    };
  }

  async logout(res: Response) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { success: true };
  }

  // Valida el refresh token de la cookie y renueva el access token.
  async refresh(req: any, res: Response) {
    const refreshToken: string | undefined = req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException("Sin refresh token");
    const hash = this.sha(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash },
    });
    if (!stored || stored.expiresAt < Date.now()) {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }
    await this.prisma.refreshToken.update({
      where: { jti: stored.jti },
      data: { lastUsedAt: Date.now() },
    });

    const username =
      this.config.get<string>("AUTH_USERNAME") || "user";
    const accessToken = await this.jwt.signAsync({ sub: username });
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 15 * 60 * 1000,
    });
    return { accessToken, tokenType: "Bearer" };
  }

  async validateApiToken(apiToken: string): Promise<boolean> {
    const hash = this.sha(apiToken);
    const row = await this.prisma.apiToken.findFirst({
      where: { tokenHash: hash, isActive: true },
    });
    if (!row) return false;
    if (row.expiresAt && row.expiresAt < Date.now()) return false;
    await this.prisma.apiToken.update({
      where: { id: row.id },
      data: { lastUsedAt: Date.now() },
    });
    return true;
  }

  // --- Sesiones (refresh tokens activos) ---
  async listSessions() {
    const rows = await this.prisma.refreshToken.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      jti: r.jti,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      deviceName: r.deviceName,
      current: false,
    }));
  }

  async revokeSession(jti: string) {
    await this.prisma.refreshToken.delete({ where: { jti } });
    return { success: true };
  }

  // --- API tokens ---
  async listTokens() {
    const rows = await this.prisma.apiToken.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      isActive: r.isActive,
    }));
  }

  async createToken(name: string): Promise<{ id: number; token: string }> {
    const token = randomUUID();
    const now = Date.now();
    const row = await this.prisma.apiToken.create({
      data: { name, tokenHash: this.sha(token), createdAt: now },
    });
    return { id: row.id, token };
  }

  async revokeToken(id: number) {
    await this.prisma.apiToken.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }
}
