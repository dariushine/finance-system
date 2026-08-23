import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from "@nestjs/common";
import { RatesService } from "./rates.service";

@Controller("api")
export class RatesController {
  constructor(private service: RatesService) {}

  @Get("rates/effective")
  effective(@Query("date") date?: string) {
    return this.service.effective(date || undefined);
  }

  @Get("daily-rates/today")
  today() {
    return this.service.effective();
  }

  @Get("daily-rates")
  list() {
    return this.service.list();
  }

  @Post("daily-rates")
  upsert(@Body() dto: any) {
    return this.service.upsert(dto);
  }

  @Get("daily-rates/:id")
  getById(@Param("id", ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Put("daily-rates/:id")
  updateById(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.updateById(id, dto);
  }

  @Delete("daily-rates/:id")
  deleteById(@Param("id", ParseIntPipe) id: number) {
    return this.service.deleteById(id);
  }
}
