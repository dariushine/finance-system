import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module";
import { TransactionsService } from "./transactions.service";
import { TransactionsController } from "./transactions.controller";

@Module({
  imports: [CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
