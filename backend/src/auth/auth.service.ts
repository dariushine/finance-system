import { createHash } from "crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
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

  // Verifica credenciales → emite access token + refresh token persistido.
  async login(username: string, password: string) {
    if (!this.authEnabled) {
      throw new UnauthorizedException("Autenticación deshabilitada");
    }
    const user = this.config.get<string>("AUTH_USERNAME");
    const pass = this.config.get<string>("AUTH_PASSWORD");
    if (username !== user || password !== pass) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const accessToken = await this.jwt.signAsync({ sub: username });
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
}
