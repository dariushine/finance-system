import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Transaction } from '../shared/entities/transaction.entity';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async findAll(
    @Query('wallet_id') walletId?: string,
    @Query('type') type?: string,
    @Query('month') month?: string,
    @Query('limit') limit?: string,
  ): Promise<Transaction[]> {
    return this.transactionsService.findAll({
      walletId: walletId ? parseInt(walletId) : undefined,
      type,
      month,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Transaction> {
    return this.transactionsService.findOne(+id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTransactionDto: CreateTransactionDto): Promise<{
    transaction: Transaction;
    message: string;
    newBalance: number;
  }> {
    return this.transactionsService.create(createTransactionDto);
  }

  @Get('reports/monthly')
  async getMonthlyReport(@Query('month') month: string) {
    return this.transactionsService.getMonthlyReport(month);
  }

  @Get('reports/category')
  async getCategoryReport(@Query('month') month: string) {
    return this.transactionsService.getCategoryReport(month);
  }
}