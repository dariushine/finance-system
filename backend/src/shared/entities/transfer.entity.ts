import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from './wallet.entity';

export type TransferStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type TransferPlatform = 'Binance' | 'LocalBitcoins' | 'P2P' | 'Bank' | 'Cash' | 'Other';
export type TransferMethod = 'P2P' | 'Spot' | 'Transfer' | 'Cash' | 'Card' | 'Other';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  // Billetera origen
  @ManyToOne(() => Wallet, (wallet) => wallet.sentTransfers, { nullable: true })
  @JoinColumn({ name: 'from_wallet_id' })
  fromWallet: Wallet;

  @Column({ nullable: true })
  from_wallet_id: number;

  // Billetera destino
  @ManyToOne(() => Wallet, (wallet) => wallet.receivedTransfers, { nullable: true })
  @JoinColumn({ name: 'to_wallet_id' })
  toWallet: Wallet;

  @Column({ nullable: true })
  to_wallet_id: number;

  // Montos enviados/recibidos
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountSent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountReceived: number;

  @Column({ type: 'varchar', length: 3 })
  currencySent: string;

  @Column({ type: 'varchar', length: 3 })
  currencyReceived: string;

  // Cálculos de tasa y spread
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  exchangeRateUsed: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  marketRate: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  spreadPercentage: number;

  // Comisiones
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  feeAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  feePercentage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  netAmountReceived: number;

  // Información adicional
  @Column({ type: 'varchar', length: 50, nullable: true })
  platform: TransferPlatform;

  @Column({ type: 'varchar', length: 20, nullable: true })
  method: TransferMethod;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: TransferStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionId: string;

  @CreateDateColumn()
  createdAt: Date;
}