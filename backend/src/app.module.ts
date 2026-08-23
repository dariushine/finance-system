import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
import { AuthModule } from "./auth/auth.module";
import { WalletsModule } from "./wallets/wallets.module";
import { CategoriesModule } from "./categories/categories.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { ExchangesModule } from "./exchanges/exchanges.module";
import { RatesModule } from "./rates/rates.module";
import { StatsModule } from "./stats/stats.module";
import { RecurringModule } from "./recurring/recurring.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WalletsModule,
    CategoriesModule,
    TransactionsModule,
    ExchangesModule,
    RatesModule,
    StatsModule,
    RecurringModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
