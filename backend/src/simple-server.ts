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
    service: 'Finance API (Simple)',
  });
});

// Obtener todas las billeteras
app.get('/api/wallets', async (req, res) => {
  try {
    const connection = await createConnection(dataSourceOptions);
    const walletRepository = connection.getRepository(Wallet);
    const wallets = await walletRepository.find();
    await connection.close();
    
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// Inicializar base de datos con billeteras iniciales
async function initializeDatabase() {
  try {
    console.log('🔗 Conectando a base de datos...');
    const connection = await createConnection(dataSourceOptions);
    
    // Sincronizar esquema
    await connection.synchronize();
    console.log('✅ Base de datos sincronizada');
    
    const walletRepository = connection.getRepository(Wallet);
    
    // Verificar si ya hay billeteras
    const count = await walletRepository.count();
    
    if (count === 0) {
      console.log('💰 Creando billeteras iniciales...');
      
      const initialWallets = [
        { name: 'Binance', type: 'crypto' as const, currency: 'USD' as const, balance: 0 },
        { name: 'Mercantil Panamá', type: 'bank' as const, currency: 'USD' as const, balance: 0 },
        { name: 'Zinli', type: 'card' as const, currency: 'USD' as const, balance: 0 },
        { name: 'Efectivo USD', type: 'cash' as const, currency: 'USD' as const, balance: 0 },
        { name: 'Bancamiga', type: 'bank' as const, currency: 'VES' as const, balance: 0 },
        { name: 'BFC', type: 'bank' as const, currency: 'VES' as const, balance: 0 },
        { name: 'Banco de Venezuela', type: 'bank' as const, currency: 'VES' as const, balance: 0 },
        { name: 'Efectivo VES', type: 'cash' as const, currency: 'VES' as const, balance: 0 },
      ];
      
      for (const walletData of initialWallets) {
        const wallet = walletRepository.create(walletData);
        await walletRepository.save(wallet);
        console.log(`   ✅ ${wallet.name} (${wallet.currency})`);
      }
      
      console.log(`✨ ${initialWallets.length} billeteras creadas`);
    } else {
      console.log(`📊 ${count} billeteras encontradas en base de datos`);
    }
    
    await connection.close();
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  }
}

// Iniciar servidor
async function startServer() {
  await initializeDatabase();
  
  app.listen(port, () => {
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`💾 Billeteras: http://localhost:${port}/api/wallets`);
  });
}

startServer().catch(console.error);