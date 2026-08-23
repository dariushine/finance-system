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
import { ListTransactionsQueryDto } from "../common/dto/query.dto";
import {
  AddFeeDto,
  AssociateTransactionDto,
  CreateTransactionDto,
  UpdateTransactionDto,
} from "./dto/transaction.dto";

@Controller("transactions")
export class TransactionsController {
  constructor(private service: TransactionsService) {}

  @Get()
  list(@Query() query: ListTransactionsQueryDto) {
    return this.service.list(query);
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateTransactionDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(":id/fee")
  addFee(@Param("id", ParseIntPipe) id: number, @Body() dto: AddFeeDto) {
    return this.service.addFee(id, dto);
  }

  @Post(":id/associate")
  associate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssociateTransactionDto,
  ) {
    return this.service.associate(id, dto);
  }
}
