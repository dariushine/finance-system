import { Controller, Get } from "@nestjs/common";

@Controller("api/health")
export class HealthController {
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
