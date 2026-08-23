import { Module } from "@nestjs/common";
import { CategoriesModule } from "../categories/categories.module";
import { RecurringService } from "./recurring.service";
import { RecurringController } from "./recurring.controller";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  imports: [CategoriesModule, TransactionsModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
