const express = require('express');
const app = express();
const port = 3002;

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API v3',
    version: '3.0.0',
    features: ['wallets', 'transactions', 'exchanges', 'balance'],
    note: 'Currency automático + exchanges implementados'
  });
});

// Wallets
app.get('/api/wallets', (req, res) => {
  res.json([
    { id: 1, name: 'Cuenta Bancaria USD', type: 'bank', currency: 'USD', balance: 1000 },
    { id: 2, name: 'Cuenta Bancaria VES', type: 'bank', currency: 'VES', balance: 50000 },
    { id: 3, name: 'Efectivo USD', type: 'cash', currency: 'USD', balance: 200 },
    { id: 4, name: 'Efectivo VES', type: 'cash', currency: 'VES', balance: 100000 },
    { id: 5, name: 'Crypto Wallet', type: 'crypto', currency: 'USD', balance: 500 },
    { id: 6, name: 'Tarjeta Prepagada', type: 'card', currency: 'USD', balance: 100 },
  ]);
});

// Transactions (simplificado)
app.post('/api/transactions', (req, res) => {
  const { walletId, categoryId, type, amount, description } = req.body;
  
  console.log(`📝 ${type} de ${amount}`);
  
  if (!walletId || !type || !amount) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  
  const currency = walletId === 2 || walletId === 4 ? 'VES' : 'USD';
  
  res.json({
    success: true,
    message: `Transacción de ${type} registrada exitosamente`,
    transaction: {
      id: Date.now(),
      type,
      amount,
      currency,
      description: description || '',
      date: new Date().toISOString().split('T')[0],
      wallet: walletId === 1 ? 'Cuenta Bancaria USD' : walletId === 2 ? 'Cuenta Bancaria VES' : walletId === 3 ? 'Efectivo USD' : walletId === 4 ? 'Efectivo VES' : walletId === 5 ? 'Crypto Wallet' : 'Tarjeta Prepagada',
      category: categoryId === 1 ? 'food' : categoryId === 11 ? 'salary' : 'other'
    },
    newBalance: type === 'expense' ? -amount : amount,
    currency
  });
});

// Exchanges entre billeteras
app.post('/api/exchanges', (req, res) => {
  const { fromWalletId, toWalletId, fromAmount, toAmount, description, marketRate } = req.body;
  
  console.log('💱 Procesando exchange:', { fromWalletId, toWalletId, fromAmount, toAmount });
  
  if (!fromWalletId || !toWalletId || !fromAmount || !toAmount) {
    return res.status(400).json({ error: 'Faltan campos requeridos: fromWalletId, toWalletId, fromAmount, toAmount' });
  }
  
  if (fromWalletId === toWalletId) {
    return res.status(400).json({ error: 'Las billeteras origen y destino deben ser diferentes' });
  }
  
  if (fromAmount <= 0 || toAmount <= 0) {
    return res.status(400).json({ error: 'Los montos deben ser mayores a 0' });
  }
  
  // Determinar currencies automáticos de wallets
  const currencies = {
    1: 'USD', 2: 'VES', 3: 'USD', 4: 'VES', 5: 'USD', 6: 'USD'
  };
  
  const fromCurrency = currencies[fromWalletId] || 'USD';
  const toCurrency = currencies[toWalletId] || 'VES';
  
  // Calcular tasa usada
  const rate = toAmount / fromAmount;
  
  // Calcular spread vs tasa de mercado
  const defaultMarketRates = {
    'USD-VES': 635,
    'VES-USD': 1/635,
    'USD-EUR': 1.07,
    'EUR-USD': 1/1.07
  };
  
  const key = `${fromCurrency}-${toCurrency}`;
  const defaultMarketRate = defaultMarketRates[key] || 1.0;
  const actualMarketRate = marketRate || defaultMarketRate;
  
  const spread = ((actualMarketRate - rate) / actualMarketRate) * 100;
  
  // Determinar wallets
  const walletNames = {
    1: 'Cuenta Bancaria USD',
    2: 'Cuenta Bancaria VES',
    3: 'Efectivo USD',
    4: 'Efectivo VES',
    5: 'Crypto Wallet',
    6: 'Tarjeta Prepagada'
  };
  
  const fromWalletName = walletNames[fromWalletId];
  const toWalletName = walletNames[toWalletId];
  
  // Respuesta detallada
  res.json({
    success: true,
    message: 'Exchange registrado exitosamente',
    exchange: {
      id: Date.now(),
      fromWallet: fromWalletName,
      toWallet: toWalletName,
      fromAmount,
      toAmount,
      fromCurrency,
      toCurrency,
      rate: parseFloat(rate.toFixed(2)),
      marketRate: parseFloat(actualMarketRate.toFixed(2)),
      spread: parseFloat(spread.toFixed(2)),
      description: description || '',
      date: new Date().toISOString().split('T')[0],
      transactionType: 'exchange'
    },
    calculation: {
      usedRate: `${rate.toFixed(2)} ${toCurrency}/${fromCurrency}`,
      marketRate: `${actualMarketRate.toFixed(2)} ${toCurrency}/${fromCurrency}`,
      spreadPercentage: `${spread.toFixed(2)}%`,
      explanation: spread > 0 ? 'Ganaste spread positivo' : 'Pagaste spread negativo',
      netResult: `Obtuviste ${toAmount} ${toCurrency} por ${fromAmount} ${fromCurrency}`
    },
    newBalances: {
      from: { amount: -fromAmount, currency: fromCurrency },
      to: { amount: toAmount, currency: toCurrency }
    },
    note: 'Currency obtenido automáticamente de las wallets'
  });
});

// Balance total
app.get('/api/balance', (req, res) => {
  const rates = { USD: 1, VES: 635, EUR: 1.07 };
  
  res.json({
    totalUSD: 2145.67,
    byCurrency: [
      { currency: 'USD', total: 1800, walletCount: 4, usdValue: 1800 },
      { currency: 'VES', total: 150000, walletCount: 2, usdValue: 236.22 }
    ],
    timestamp: new Date().toISOString(),
    ratesUsed: rates
  });
});

app.listen(port, () => {
  console.log(`🚀 Servidor con exchanges ejecutándose en: http://localhost:${port}`);
  console.log('📊 Health: GET /api/health');
  console.log('💾 Billeteras: GET /api/wallets');
  console.log('💸 Transacciones: POST /api/transactions');
  console.log('💱 Exchanges: POST /api/exchanges');
  console.log('💰 Balance: GET /api/balance');
  console.log('\n✨ Currency automático de wallet + exchanges implementados');
  console.log('📝 Ejemplo exchange: 100 USD → 60,000 VES (tasa 600 VES/USD)');
});