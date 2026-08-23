import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { RecurringService } from "./recurring.service";

@Controller("api/recurring-payments")
export class RecurringController {
  constructor(private service: RecurringService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
