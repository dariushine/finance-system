import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>("JWT_SECRET", "change-me-in-production"),
        signOptions: { expiresIn: cs.get<string>("JWT_EXPIRES_IN", "15m") as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    // Guard global registrado como provider APP_GUARD para que Nest inyecte
    // correctamente la DI (AuthService, JwtService, ConfigService). El patrón
    // app.get()+useGlobalGuards() dejaba `this.auth` undefined.
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
