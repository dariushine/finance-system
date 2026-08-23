import { Body, Controller, Get, Put } from "@nestjs/common";
import { SettingsService } from "./settings.service";

@Controller("api/settings")
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put("timezone")
  setTimeZone(@Body() dto: { timezone?: string }) {
    if (!dto.timezone) throw new Error("timezone requerida");
    return this.service.setTimeZone(dto.timezone);
  }
}
