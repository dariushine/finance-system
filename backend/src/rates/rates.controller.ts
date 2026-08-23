import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RatesService } from "./rates.service";

@Controller("api")
export class RatesController {
  constructor(private service: RatesService) {}

  @Get("rates/effective")
  effective(@Query("date") date?: string) {
    return this.service.effective(date || undefined);
  }

  @Get("daily-rates")
  list() {
    return this.service.list();
  }

  @Post("daily-rates")
  upsert(@Body() dto: any) {
    return this.service.upsert(dto);
  }
}
