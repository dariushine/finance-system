import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import { RecurringService } from "./recurring.service";

@Controller("api/recurring-payments")
export class RecurringController {
  constructor(private service: RecurringService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Post(":id/execute")
  execute(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.execute(id, dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
