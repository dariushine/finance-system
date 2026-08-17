import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Transaction } from './transaction.entity';
import { Transfer } from './transfer.entity';

export type WalletType = 'crypto' | 'bank' | 'cash' | 'card' | 'investment';
export type Currency = 'USD' | 'VES' | 'EUR';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: WalletType;

  @Column({ type: 'varchar', length: 3 })
  currency: Currency;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  excludeFromTotal: boolean;

  @Column({ type: 'boolean', default: false })
  hideInDashboard: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @OneToMany(() => Transfer, (transfer) => transfer.fromWallet)
  sentTransfers: Transfer[];

  @OneToMany(() => Transfer, (transfer) => transfer.toWallet)
  receivedTransfers: Transfer[];
}