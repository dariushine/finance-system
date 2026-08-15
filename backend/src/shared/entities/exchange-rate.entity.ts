import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 3 })
  sourceCurrency: string;

  @Column({ type: 'varchar', length: 3 })
  targetCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  rate: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'varchar', length: 50, default: 'api' })
  source: string;

  @CreateDateColumn()
  createdAt: Date;
}