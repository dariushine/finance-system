import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { TransactionsService } from "./transactions.service";

@Controller("api/transactions")
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(":id/fee")
  addFee(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.addFee(id, dto);
  }

  @Post(":id/associate")
  associate(@Param("id", ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.associate(id, dto);
  }
}
