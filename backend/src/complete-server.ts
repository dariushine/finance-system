import express from 'express';
import { createConnection } from 'typeorm';
import { Wallet } from './shared/entities/wallet.entity';
import { Category } from './shared/entities/category.entity';
import { Transaction } from './shared/entities/transaction.entity';
import { dataSourceOptions } from './shared/config/data-source';

const app = express();
const port = 3001;

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API v2',
    version: '2.0.0',
    features: ['wallets', 'transactions', 'categories', 'balance'],
  });
});

// Obtener todas las billeteras
app.get('/api/wallets', async (req, res) => {
  try {
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    const wallets = await walletRepository.find({
      where: { isActive: true },
      order: { currency: 'ASC', name: 'ASC' },
    });
    await connection.close();
    
    res.json(wallets);
  } catch (error) {
    console.error('Error obteniendo billeteras:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener categorías
app.get('/api/categories', async (req, res) => {
  try {
    const { type } = req.query;
    const connection = await createConnection(dataSourceOptions);
    const categoryRepository = connection.getRepository(Category);
    
    const where: any = { isActive: true };
    if (type === 'income' || type === 'expense') {
      where.type = type;
    }
    
    const categories = await categoryRepository.find({
      where,
      order: { type: 'ASC', name: 'ASC' },
    });
    await connection.close();
    
    res.json(categories);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear transacción
app.post('/api/transactions', async (req, res) => {
  try {
    const { walletId, categoryId, type, amount, currency, description, date } = req.body;
    
    // Validaciones básicas
    if (!walletId || !categoryId || !type || !amount || !currency) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: walletId, categoryId, type, amount, currency' 
      });
    }
    
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'type debe ser "income" o "expense"' });
    }
    
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    const categoryRepository = connection.getRepository(Category);
    const transactionRepository = connection.getRepository(Transaction);
    
    // Validar billetera
    const wallet = await walletRepository.findOne({
      where: { id: walletId, isActive: true },
    });
    
    if (!wallet) {
      await connection.close();
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    // Validar moneda
    if (wallet.currency !== currency) {
      await connection.close();
      return res.status(400).json({ 
        error: `La billetera usa ${wallet.currency}, pero la transacción es en ${currency}` 
      });
    }
    
    // Validar categoría
    const category = await categoryRepository.findOne({
      where: { id: categoryId, isActive: true },
    });
    
    if (!category) {
      await connection.close();
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    // Validar fondos para gastos
    if (type === 'expense' && wallet.balance < amount) {
      await connection.close();
      return res.status(400).json({ 
        error: `Fondos insuficientes. Balance actual: ${wallet.balance} ${currency}, necesitas: ${amount} ${currency}` 
      });
    }
    
    // Crear transacción
    const transaction = transactionRepository.create({
      wallet,
      category,
      type,
      amount,
      currency,
      description: description || '',
      date: date || new Date().toISOString().split('T')[0],
      exchangeRate: 1.0,
      convertedAmount: amount,
    });
    
    // Actualizar balance
    if (type === 'expense') {
      wallet.balance -= amount;
    } else {
      wallet.balance += amount;
    }
    
    // Guardar todo
    await transactionRepository.save(transaction);
    await walletRepository.save(wallet);
    await connection.close();
    
    res.status(201).json({
      transaction: {
        id: transaction.id,
        type,
        amount,
        currency,
        description: transaction.description,
        date: transaction.date,
        wallet: wallet.name,
        category: category.name,
      },
      message: `Transacción de ${type === 'expense' ? 'gasto' : 'ingreso'} registrada exitosamente`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Error creando transacción:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener transacciones
app.get('/api/transactions', async (req, res) => {
  try {
    const { wallet_id, type, month, limit = '50' } = req.query;
    const connection = await createConnection(dataSourceOptions);
    const transactionRepository = connection.getRepository(Transaction);
    
    let query = transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.wallet', 'wallet')
      .leftJoinAndSelect('transaction.category', 'category')
      .orderBy('transaction.date', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC')
      .take(parseInt(limit as string));
    
    if (wallet_id) {
      query = query.andWhere('transaction.wallet_id = :walletId', { walletId: wallet_id });
    }
    
    if (type === 'income' || type === 'expense') {
      query = query.andWhere('transaction.type = :type', { type });
    }
    
    if (month) {
      query = query.andWhere("strftime('%Y-%m', transaction.date) = :month", { month });
    }
    
    const transactions = await query.getMany();
    await connection.close();
    
    res.json(transactions);
  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Balance total
app.get('/api/balance', async (req, res) => {
  try {
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    
    const wallets = await walletRepository.find({
      where: { isActive: true },
    });
    
    await connection.close();
    
    // Calcular por moneda
    const byCurrency = {};
    const rates = { USD: 1, VES: 635, EUR: 1.07 };
    
    wallets.forEach(wallet => {
      const currency = wallet.currency;
      if (!byCurrency[currency]) {
        byCurrency[currency] = {
          currency,
          total: 0,
          walletCount: 0,
        };
      }
      
      byCurrency[currency].total += wallet.balance;
      byCurrency[currency].walletCount++;
    });
    
    // Convertir todo a USD
    let totalUSD = 0;
    const byCurrencyArray = Object.values(byCurrency).map((data: any) => {
      const usdValue = data.total / rates[data.currency];
      totalUSD += usdValue;
      
      return {
        ...data,
        usdValue,
        rate: rates[data.currency],
      };
    });
    
    res.json({
      totalUSD: parseFloat(totalUSD.toFixed(2)),
      byCurrency: byCurrencyArray,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error calculando balance:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Inicializar base de datos
async function initializeDatabase() {
  try {
    console.log('🔗 Conectando a base de datos...');
    const connection = await createConnection(dataSourceOptions);
    
    // Sincronizar esquema
    await connection.synchronize();
    console.log('✅ Base de datos sincronizada');
    
    const walletRepository = connection.getRepository(Wallet);
    const categoryRepository = connection.getRepository(Category);
    
    // Crear billeteras iniciales
    const walletCount = await walletRepository.count();
    if (walletCount === 0) {
      console.log('💰 Creando billeteras iniciales genéricas...');
      
      const initialWallets = [
        { name: 'Cuenta Bancaria USD', type: 'bank' as const, currency: 'USD' as const, balance: 0, description: 'Cuenta bancaria en dólares' },
        { name: 'Cuenta Bancaria VES', type: 'bank' as const, currency: 'VES' as const, balance: 0, description: 'Cuenta bancaria en bolívares' },
        { name: 'Efectivo USD', type: 'cash' as const, currency: 'USD' as const, balance: 0, description: 'Efectivo en dólares' },
        { name: 'Efectivo VES', type: 'cash' as const, currency: 'VES' as const, balance: 0, description: 'Efectivo en bolívares' },
        { name: 'Crypto Wallet', type: 'crypto' as const, currency: 'USD' as const, balance: 0, description: 'Wallet de criptomonedas (Binance, etc.)' },
        { name: 'Tarjeta Prepagada', type: 'card' as const, currency: 'USD' as const, balance: 0, description: 'Tarjeta prepagada internacional' },
      ];
      
      for (const walletData of initialWallets) {
        const wallet = walletRepository.create(walletData);
        await walletRepository.save(wallet);
        console.log(`   ✅ ${wallet.name} (${wallet.currency})`);
      }
      
      console.log(`✨ ${initialWallets.length} billeteras creadas`);
    } else {
      console.log(`📊 ${walletCount} billeteras encontradas`);
    }
    
    // Crear categorías iniciales
    const categoryCount = await categoryRepository.count();
    if (categoryCount === 0) {
      console.log('🏷️  Creando categorías iniciales...');
      
      const initialCategories = [
        // Gastos
        { name: 'food', type: 'expense', color: '#e74c3c' },
        { name: 'transport', type: 'expense', color: '#4ecdc4' },
        { name: 'housing', type: 'expense', color: '#45b7d1' },
        { name: 'utilities', type: 'expense', color: '#ffd166' },
        { name: 'entertainment', type: 'expense', color: '#a663cc' },
        { name: 'health', type: 'expense', color: '#ff6b6b' },
        { name: 'education', type: 'expense', color: '#1dd3b0' },
        { name: 'shopping', type: 'expense', color: '#f28482' },
        { name: 'personal', type: 'expense', color: '#b8b8b8' },
        { name: 'other_expense', type: 'expense', color: '#95a5a6' },
        
        // Ingresos
        { name: 'salary', type: 'income', color: '#27ae60' },
        { name: 'freelance', type: 'income', color: '#2ecc71' },
        { name: 'investment', type: 'income', color: '#3498db' },
        { name: 'gift', type: 'income', color: '#9b59b6' },
        { name: 'other_income', type: 'income', color: '#34495e' },
      ];
      
      for (const categoryData of initialCategories) {
        const category = categoryRepository.create(categoryData);
        await categoryRepository.save(category);
      }
      
      console.log(`✨ ${initialCategories.length} categorías creadas`);
    } else {
      console.log(`🏷️  ${categoryCount} categorías encontradas`);
    }
    
    await connection.close();
    return true;
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    return false;
  }
}

// Manejar cierre limpio
process.on('SIGINT', () => {
  console.log('\n👋 Recibido SIGINT. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Recibido SIGTERM. Cerrando servidor...');
  process.exit(0);
});

// Iniciar servidor
async function startServer() {
  const dbInitialized = await initializeDatabase();
  
  if (!dbInitialized) {
    console.error('❌ No se pudo inicializar la base de datos. Saliendo.');
    process.exit(1);
  }
  
  app.listen(port, () => {
    console.log(`\n🚀 Servidor ejecutándose en: http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`💾 Billeteras: http://localhost:${port}/api/wallets`);
    console.log(`🏷️  Categorías: http://localhost:${port}/api/categories`);
    console.log(`💸 Transacciones: http://localhost:${port}/api/transactions`);
    console.log(`💰 Balance: http://localhost:${port}/api/balance`);
    console.log('\n✨ Servidor listo con transacciones activas. Presiona Ctrl+C para detener.');
  });
}

startServer().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});