import { DataSource, DataSourceOptions } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { Transfer } from '../entities/transfer.entity';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { Category } from '../entities/category.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.DB_PATH || './data/finance.db',
  entities: [Wallet, Transaction, Transfer, ExchangeRate, Category],
  migrations: ['dist/migrations/*.js'],
  synchronize: process.env.NODE_ENV !== 'production', // Auto-sync en desarrollo
  logging: process.env.NODE_ENV === 'development',
};

// Para CLI de TypeORM
export const AppDataSource = new DataSource(dataSourceOptions);