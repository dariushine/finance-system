import { Module } from "@nestjs/common";
import { ExchangesService } from "./exchanges.service";
import { ExchangesController } from "./exchanges.controller";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  imports: [TransactionsModule],
  controllers: [ExchangesController],
  providers: [ExchangesService],
  exports: [ExchangesService],
})
export class ExchangesModule {}
