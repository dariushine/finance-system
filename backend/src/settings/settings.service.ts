import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private defaultTz = "America/Caracas";

  async getUserTimeZone(): Promise<string> {
    const s = await this.prisma.setting.findUnique({
      where: { key: "user_timezone" },
    });
    if (!s?.value) {
      await this.prisma.setting.upsert({
        where: { key: "user_timezone" },
        update: {},
        create: { key: "user_timezone", value: this.defaultTz },
      });
      return this.defaultTz;
    }
    return s.value;
  }

  async get() {
    const tz = await this.getUserTimeZone();
    return {
      timezone: tz,
      name: "Finance API",
      version: "2.0.0",
    };
  }

  async setTimeZone(tz: string) {
    await this.prisma.setting.upsert({
      where: { key: "user_timezone" },
      update: { value: tz },
      create: { key: "user_timezone", value: tz },
    });
    return { success: true, timezone: tz };
  }
}
