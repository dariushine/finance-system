import { Module } from "@nestjs/common";
import { RecurringService } from "./recurring.service";
import { RecurringController } from "./recurring.controller";
import { CategoriesModule } from "../categories/categories.module";

@Module({
  imports: [CategoriesModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
