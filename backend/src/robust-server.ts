import express from 'express';
import { createConnection } from 'typeorm';
import { Wallet } from './shared/entities/wallet.entity';
import { dataSourceOptions } from './shared/config/data-source';

const app = express();
const port = 3001;

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API',
    version: '1.0.0',
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

// Crear billetera
app.post('/api/wallets', async (req, res) => {
  try {
    const { name, type, currency, balance = 0 } = req.body;
    
    if (!name || !type || !currency) {
      return res.status(400).json({ error: 'Nombre, tipo y moneda son requeridos' });
    }
    
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    
    const wallet = walletRepository.create({
      name,
      type,
      currency,
      balance,
    });
    
    const savedWallet = await walletRepository.save(wallet);
    await connection.close();
    
    res.status(201).json(savedWallet);
  } catch (error) {
    console.error('Error creando billetera:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar balance de billetera
app.post('/api/wallets/:id/update-balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'Monto es requerido' });
    }
    
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    
    const wallet = await walletRepository.findOne({
      where: { id: parseInt(id), isActive: true },
    });
    
    if (!wallet) {
      await connection.close();
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    wallet.balance += parseFloat(amount);
    const updatedWallet = await walletRepository.save(wallet);
    await connection.close();
    
    res.json(updatedWallet);
  } catch (error) {
    console.error('Error actualizando balance:', error);
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
    const count = await walletRepository.count();
    
    if (count === 0) {
      console.log('💰 Creando billeteras iniciales genéricas...');
      
      const initialWallets = [
        // Billeteras genéricas para cualquier usuario
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
      
      console.log(`✨ ${initialWallets.length} billeteras genéricas creadas`);
    } else {
      console.log(`📊 ${count} billeteras encontradas en base de datos`);
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
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`💾 Billeteras: http://localhost:${port}/api/wallets`);
    console.log(`💰 Balance: http://localhost:${port}/api/balance`);
    console.log('\n✨ Servidor listo. Presiona Ctrl+C para detener.');
  });
}

startServer().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});