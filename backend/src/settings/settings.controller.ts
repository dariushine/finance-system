import { Body, Controller, Get, Put } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { SetTimezoneDto } from "../common/dto/common.dto";

@Controller("api/settings")
export class SettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  // El frontend usa PUT /api/settings/user_timezone
  @Put("user_timezone")
  setTimeZone(@Body() dto: SetTimezoneDto) {
    return this.service.setTimeZone(dto.timezone);
  }

  // Forma alternativa: PUT /api/settings
  @Put()
  update(@Body() dto: { timezone?: string; user_timezone?: string }) {
    const tz = dto.timezone || dto.user_timezone;
    if (!tz) throw new Error("timezone requerida");
    return this.service.setTimeZone(tz);
  }
}
