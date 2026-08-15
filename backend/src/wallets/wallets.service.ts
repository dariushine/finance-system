import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../shared/entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private walletsRepository: Repository<Wallet>,
  ) {}

  async findAll(): Promise<Wallet[]> {
    return this.walletsRepository.find({
      where: { isActive: true },
      order: { currency: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Wallet> {
    const wallet = await this.walletsRepository.findOne({
      where: { id, isActive: true },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet con ID ${id} no encontrada`);
    }

    return wallet;
  }

  async create(createWalletDto: CreateWalletDto): Promise<Wallet> {
    const wallet = this.walletsRepository.create(createWalletDto);
    return this.walletsRepository.save(wallet);
  }

  async update(id: number, updateWalletDto: UpdateWalletDto): Promise<Wallet> {
    const wallet = await this.findOne(id);
    
    Object.assign(wallet, updateWalletDto);
    return this.walletsRepository.save(wallet);
  }

  async remove(id: number): Promise<void> {
    const wallet = await this.findOne(id);
    wallet.isActive = false;
    await this.walletsRepository.save(wallet);
  }

  async calculateTotalBalance(): Promise<{ totalUSD: number; byCurrency: any[] }> {
    const wallets = await this.findAll();
    
    // Agrupar por moneda
    const byCurrency = wallets.reduce((acc, wallet) => {
      const currency = wallet.currency;
      if (!acc[currency]) {
        acc[currency] = {
          currency,
          total: 0,
          walletCount: 0,
          wallets: [],
        };
      }
      
      acc[currency].total += wallet.balance;
      acc[currency].walletCount++;
      acc[currency].wallets.push({
        id: wallet.id,
        name: wallet.name,
        balance: wallet.balance,
      });
      
      return acc;
    }, {});
    
    // Convertir todo a USD (tasas hardcodeadas por ahora)
    const rates = {
      USD: 1,
      VES: 635, // Tasa aproximada
      EUR: 1.07,
    };
    
    let totalUSD = 0;
    const byCurrencyArray = Object.values(byCurrency).map((currencyData: any) => {
      const usdValue = currencyData.total / rates[currencyData.currency];
      totalUSD += usdValue;
      
      return {
        ...currencyData,
        usdValue,
        rate: rates[currencyData.currency],
      };
    });
    
    return {
      totalUSD,
      byCurrency: byCurrencyArray,
    };
  }

  async updateBalance(walletId: number, amount: number): Promise<Wallet> {
    const wallet = await this.findOne(walletId);
    wallet.balance += amount;
    return this.walletsRepository.save(wallet);
  }

  async seedInitialWallets(): Promise<Wallet[]> {
    const initialWallets = [
      {
        name: 'Cuenta Bancaria USD',
        type: 'bank' as const,
        currency: 'USD' as const,
        balance: 0,
        description: 'Cuenta bancaria en dólares',
        icon: 'bank',
        color: '#0077b6',
      },
      {
        name: 'Cuenta Bancaria VES',
        type: 'bank' as const,
        currency: 'VES' as const,
        balance: 0,
        description: 'Cuenta bancaria en bolívares',
        icon: 'bank',
        color: '#e63946',
      },
      {
        name: 'Efectivo USD',
        type: 'cash' as const,
        currency: 'USD' as const,
        balance: 0,
        description: 'Efectivo en dólares',
        icon: 'cash',
        color: '#2a9d8f',
      },
      {
        name: 'Efectivo VES',
        type: 'cash' as const,
        currency: 'VES' as const,
        balance: 0,
        description: 'Efectivo en bolívares',
        icon: 'cash',
        color: '#588157',
      },
      {
        name: 'Crypto Wallet',
        type: 'crypto' as const,
        currency: 'USD' as const,
        balance: 0,
        description: 'Wallet de criptomonedas (Binance, etc.)',
        icon: 'crypto',
        color: '#f0b90b',
      },
      {
        name: 'Tarjeta Prepagada',
        type: 'card' as const,
        currency: 'USD' as const,
        balance: 0,
        description: 'Tarjeta prepagada internacional',
        icon: 'card',
        color: '#00b4d8',
      },
    ];

    const createdWallets = [];
    for (const walletData of initialWallets) {
      const existing = await this.walletsRepository.findOne({
        where: { name: walletData.name },
      });

      if (!existing) {
        const wallet = this.walletsRepository.create(walletData);
        createdWallets.push(await this.walletsRepository.save(wallet));
      }
    }

    return createdWallets;
  }
}