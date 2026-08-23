import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Si la auth está deshabilitada (dev), se deja pasar todo.
    if (!this.auth.authEnabled) return true;

    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers?.authorization;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies?.access_token) {
      token = req.cookies.access_token; // sesión por cookie httpOnly
    }
    if (token) {
      try {
        this.jwt.verify(token, {
          secret: this.config.get<string>(
            "JWT_SECRET",
            "change-me-in-production",
          ),
        });
        return true;
      } catch {
        throw new UnauthorizedException("Token inválido");
      }
    }
    // API token (X-API-Key)
    const apiKey: string | undefined = req.headers?.["x-api-key"];
    if (apiKey && (await this.auth.validateApiToken(apiKey))) {
      return true;
    }
    throw new UnauthorizedException("No autorizado");
  }
}
