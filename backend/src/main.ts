import { ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: true, credentials: true });

  // Guard global de auth (no-op si la auth está deshabilitada en dev).
  const reflector = app.get(Reflector);
  const guard = app.get(JwtAuthGuard);
  app.useGlobalGuards(guard);

  const port = Number(process.env.PORT) || 3002;
  await app.listen(port);
  console.log(`🚀 Finance API (NestJS + Prisma) en http://localhost:${port}`);
}
bootstrap();
