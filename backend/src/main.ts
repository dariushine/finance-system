import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Prefijo global /api: los @Controller NO llevan el path repetido.
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT) || 3002;
  await app.listen(port);
  console.log(`🚀 Finance API (NestJS + Prisma) en http://localhost:${port}`);
}
bootstrap();
