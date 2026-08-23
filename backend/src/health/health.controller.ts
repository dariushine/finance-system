import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Finance API (NestJS + Prisma)",
      version: "2.0.0",
    };
  }
}
