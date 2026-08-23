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
    // Guard global con useClass: Nest instancia UNA copia completa del guard
    // mediante DI (inyecta reflector, jwt, config, auth). Con app.get()+useGlobal
    // Guards o useExisting, el Reflector/Services pueden quedar undefined.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
