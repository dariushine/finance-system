// scripts/seed-demo.js — Puebla la BD demo con datos para capturas/README.
// Se ejecuta contra el backend aislado (Recibe BASE_URL via argv/env).
// Usa la API pública (no SQL directo) para que los valores pasen por la
// conversión real de escala (montos ×100, tasas ×10000).
const BASE = process.env.API_BASE_URL || 'http://localhost:3002/api';

async function jfetch(p, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  if (!r.ok && r.status < 400 && !j) throw new Error(`${method} ${p} -> ${r.status}`);
  return { status: r.status, body: j };
}

const TZ = 'America/Caracas';
let walletIds = {};

async function main() {
  // ---- Wallets ----
  const wallets = [
    { name: 'Banco Nacional', alias: 'Sueldo', type: 'bank', currency: 'USD', balance: 2450.00, color: '#1976d2', icon: 'account_balance' },
    { name: 'Efectivo',      alias: 'Gastos diarios', type: 'cash', currency: 'VES', balance: 180000.00, color: '#2e7d32', icon: 'payments' },
    { name: 'Cripto',        alias: 'USDT', type: 'crypto', currency: 'USD', balance: 320.50, color: '#9c27b0', icon: 'currency_bitcoin' },
    { name: 'Tarjeta Prepagada', type: 'card', currency: 'USD', balance: 85.25, color: '#d32f2f', icon: 'credit_card' },
    { name: 'Inversiones',   type: 'investment', currency: 'VES', balance: 950000.00, color: '#ed6c02', icon: 'trending_up' },
  ];
  for (const w of wallets) {
    const r = await jfetch('/wallets', { method: 'POST', body: w });
    if (r.status >= 400 && r.body && /UNIQUE/i.test(r.body.error || '')) continue; // ya existe
    walletIds[w.name] = r.body && r.body.id;
    console.log('wallet:', w.name, '->', r.status, r.body && r.body.balance);
  }

  // ---- Categorías de usuario (además de las de sistema) ----
  const cats = [
    ['Comida', 'expense', '#e74c3c'], ['Transporte', 'expense', '#4ecdc4'],
    ['Servicios', 'expense', '#45b7d1'], ['Entretenimiento', 'expense', '#a663cc'],
    ['Salud', 'expense', '#ff6b6b'], ['Educación', 'expense', '#1dd3b0'],
    ['Salario', 'income', '#27ae60'], ['Freelance', 'income', '#2ecc71'],
    ['Inversión', 'income', '#3498db'], ['Regalo', 'income', '#9b59b6'],
  ];
  for (const [name, type, color] of cats) {
    const r = await jfetch('/categories', { method: 'POST', body: { name, type, color } });
    if (r.status >= 400 && r.body && /UNIQUE/i.test(r.body.error || '')) continue;
  }
  console.log('categorías ok');

  // ---- Transacciones (fechas recientes de agosto 2026) ----
  const tx = (wallet, cat, type, amount, description, date, time, fee) =>
    jfetch('/transactions', { method: 'POST', body: {
      walletId: walletIds[wallet], categoryName: cat, type, amount,
      description, date, time, tz: TZ, ...(fee ? { fee } : {}),
    } });

  await tx('Banco Nacional', 'Salario', 'income', 2500.00, 'Sueldo agosto', '2026-08-01', '09:00');
  await tx('Banco Nacional', 'Freelance', 'income', 480.75, 'Landing page cliente', '2026-08-05', '14:30');
  await tx('Banco Nacional', 'Comida', 'expense', 35.40, 'Supermercado', '2026-08-06', '18:00');
  await tx('Efectivo', 'Transporte', 'expense', 250.00, 'Gasolina', '2026-08-08', '11:00');
  await tx('Efectivo', 'Comida', 'expense', 120.00, 'Almuerzo', '2026-08-09', '13:15');
  await tx('Banco Nacional', 'Servicios', 'expense', 78.00, 'Internet + plan', '2026-08-10', '08:00');
  await tx('Banco Nacional', 'Entretenimiento', 'expense', 22.90, 'Streaming', '2026-08-11', '20:00');
  await tx('Cripto', 'Inversión', 'income', 150.00, 'Venta parcial USDT', '2026-08-12', '16:45');
  await tx('Banco Nacional', 'Educación', 'expense', 89.00, 'Curso .NET 8', '2026-08-14', '10:00', 2.50);
  await tx('Tarjeta Prepagada', 'Salud', 'expense', 18.75, 'Farmacia', '2026-08-16', '09:30');
  await tx('Banco Nacional', 'Regalo', 'income', 60.00, 'Cumpleaños', '2026-08-18', '12:00');
  console.log('transacciones ok');

  // ---- Exchange: USD → VES ----
  const r = await jfetch('/exchanges', { method: 'POST', body: {
    fromWalletId: walletIds['Banco Nacional'], toWalletId: walletIds['Efectivo'],
    fromAmount: 200, toAmount: 126990, fee: 1.00,
    description: 'Cambio USD a bolívares', date: '2026-08-13', time: '15:00', tz: TZ,
  }});
  console.log('exchange ok ->', r.status, r.body && r.body.exchange && r.body.exchange.rate);

  // ---- Tasas diarias ----
  const rates = [
    ['2026-08-01', 640.25, 651.00], ['2026-08-05', 638.90, 649.75],
    ['2026-08-10', 636.50, 648.20], ['2026-08-15', 635.10, 647.00],
    ['2026-08-19', 634.95, 646.30],
  ];
  for (const [date, bcv, paralelo] of rates) {
    await jfetch('/daily-rates', { method: 'POST', body: { date, bcv, paralelo } });
  }
  console.log('tasas ok');

  // ---- Recurrente ----
  const rp = await jfetch('/recurring-payments', { method: 'POST', body: {
    name: 'Suscripción streaming', description: 'Netflix', amount: 11.99,
    fee: 0, currency: 'USD', type: 'expense', categoryId: 1, walletId: walletIds['Banco Nacional'],
  }});
  console.log('recurrente ok ->', rp.status);

  console.log('\nSeed completo ✅');
}

main().catch((e) => { console.error('Seed error:', e.message); process.exit(1); });
