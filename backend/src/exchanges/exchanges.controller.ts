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
import { ExchangesService } from "./exchanges.service";
import { CreateExchangeDto, UpdateExchangeDto } from "./dto/exchange.dto";

@Controller("api/exchanges")
export class ExchangesController {
  constructor(private service: ExchangesService) {}

  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: CreateExchangeDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateExchangeDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
