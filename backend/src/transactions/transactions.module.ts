import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../shared/entities/transaction.entity';
import { Wallet } from '../shared/entities/wallet.entity';
import { Category } from '../shared/entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Wallet, Category])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}