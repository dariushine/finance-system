import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../shared/entities/transaction.entity';
import { Wallet } from '../shared/entities/wallet.entity';
import { Category } from '../shared/entities/category.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';

interface FindAllOptions {
  walletId?: number;
  type?: string;
  month?: string;
  limit?: number;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private walletsRepository: Repository<Wallet>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async findAll(options: FindAllOptions): Promise<Transaction[]> {
    const { walletId, type, month, limit = 50 } = options;
    
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.wallet', 'wallet')
      .leftJoinAndSelect('transaction.category', 'category')
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC')
      .take(limit);

    if (walletId) {
      query.andWhere('transaction.wallet_id = :walletId', { walletId });
    }

    if (type) {
      query.andWhere('transaction.type = :type', { type });
    }

    if (month) {
      query.andWhere("strftime('%Y-%m', transaction.date) = :month", { month });
    }

    return query.getMany();
  }

  async findOne(id: number): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['wallet', 'category'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction con ID ${id} no encontrada`);
    }

    return transaction;
  }

  async create(createTransactionDto: CreateTransactionDto): Promise<{
    transaction: Transaction;
    message: string;
    newBalance: number;
  }> {
    const { walletId, categoryId, type, amount, currency, description, date } = createTransactionDto;

    // Validar billetera
    const wallet = await this.walletsRepository.findOne({
      where: { id: walletId, isActive: true },
    });

    if (!wallet) {
      throw new NotFoundException(`Billetera con ID ${walletId} no encontrada`);
    }

    // Validar que la moneda coincida
    if (wallet.currency !== currency) {
      throw new BadRequestException(
        `La billetera usa ${wallet.currency}, pero la transacción es en ${currency}`,
      );
    }

    // Validar categoría
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, isActive: true },
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada`);
    }

    // Validar fondos para gastos
    if (type === 'expense' && wallet.balance < amount) {
      throw new BadRequestException(
        `Fondos insuficientes. Balance actual: ${wallet.balance} ${currency}, necesitas: ${amount} ${currency}`,
      );
    }

    // Calcular conversión si es necesario (para futuras tasas de cambio)
    const exchangeRate = 1.0; // Por ahora, misma moneda
    const convertedAmount = amount * exchangeRate;

    // Crear transacción
    const transaction = this.transactionsRepository.create({
      wallet,
      category,
      type,
      amount,
      currency,
      description,
      date: date || new Date().toISOString().split('T')[0],
      exchangeRate,
      convertedAmount,
    });

    // Actualizar balance de billetera
    if (type === 'expense') {
      wallet.balance -= amount;
    } else if (type === 'income') {
      wallet.balance += amount;
    }

    // Guardar todo en transacción
    await this.transactionsRepository.save(transaction);
    await this.walletsRepository.save(wallet);

    return {
      transaction,
      message: `Transacción de ${type === 'expense' ? 'gasto' : 'ingreso'} registrada exitosamente`,
      newBalance: wallet.balance,
    };
  }

  async getMonthlyReport(month: string): Promise<any> {
    const transactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where("strftime('%Y-%m', transaction.date) = :month", { month })
      .getMany();

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.convertedAmount, 0);

    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.convertedAmount, 0);

    return {
      month,
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: transactions.length,
    };
  }

  async getCategoryReport(month: string): Promise<any> {
    const results = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .select('category.name', 'category')
      .addSelect('SUM(transaction.convertedAmount)', 'amount')
      .addSelect('COUNT(transaction.id)', 'count')
      .where("strftime('%Y-%m', transaction.date) = :month", { month })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .groupBy('category.name')
      .orderBy('amount', 'DESC')
      .getRawMany();

    return results;
  }
}