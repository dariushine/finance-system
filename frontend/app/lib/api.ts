// API service for the finance system
// Usa rewrites de Next.js: /api → backend:3002/api
export const API_URL = '/api';

// Wallet API
export interface Wallet {
  id: number;
  name: string;
  alias?: string | null;
  type: string;
  currency: string;
  balance: number;
  description?: string;
  icon?: string | null;
  color?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

// Transaction API
export interface Transaction {
  id: number;
  type: 'expense' | 'income';
  category: string;
  amount: number;
  wallet: string;
  date: string;
  description?: string;
}

// Exchange API  
export interface Exchange {
  id: number;
  rate: number;
  marketRate?: number;
  spread?: number;
  debitTransaction: Transaction;
  creditTransaction: Transaction;
  fromWalletId: number;
  toWalletId: number;
  fromAmount: number;
  toAmount: number;
  description?: string;
  created_at: string;
}

// Wallets API
export async function getWallets(): Promise<Wallet[]> {
  const response = await fetch(`${API_URL}/wallets`);
  if (!response.ok) throw new Error('Failed to load wallets');
  return response.json();
}

// Obtener billeteras eliminadas (soft-delete)
export async function getDeletedWallets(): Promise<Wallet[]> {
  const response = await fetch(`${API_URL}/wallets/deleted`);
  if (!response.ok) throw new Error('Failed to load deleted wallets');
  return response.json();
}

// Obtener una billetera por id
export async function getWallet(id: number | string): Promise<Wallet> {
  const response = await fetch(`${API_URL}/wallets/${id}`);
  if (!response.ok) throw new Error('Failed to load wallet');
  return response.json();
}

export interface WalletInput {
  name: string;
  alias?: string;
  type: string;
  currency: string;
  balance?: number;
  description?: string;
  icon?: string;
  color?: string;
}

// Crear una billetera
export async function createWallet(data: WalletInput): Promise<Wallet> {
  const response = await fetch(`${API_URL}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'Failed to create wallet');
  }
  return response.json();
}

// Actualizar una billetera
export async function updateWallet(id: number | string, data: Partial<WalletInput>): Promise<Wallet> {
  const response = await fetch(`${API_URL}/wallets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'Failed to update wallet');
  }
  return response.json();
}

// Soft-delete una billetera
export async function deleteWallet(id: number | string): Promise<any> {
  const response = await fetch(`${API_URL}/wallets/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete wallet');
  return response.json();
}

// Reactivar una billetera
export async function reactivateWallet(id: number | string): Promise<Wallet> {
  const response = await fetch(`${API_URL}/wallets/${id}/reactivate`, { method: 'PUT' });
  if (!response.ok) throw new Error('Failed to reactivate wallet');
  return response.json();
}

export interface WalletTransaction {
  id: number;
  type: 'expense' | 'income';
  amount: number;
  description?: string;
  date: string;
  category: string;
  createdAt?: string;
}

export interface WalletReport {
  wallet: Wallet;
  range: { from: string; to: string; period: string };
  summary: {
    income: number;
    expense: number;
    net: number;
    transactionCount: number;
  };
  transactions: WalletTransaction[];
}

// Reporte de una billetera con rango de fechas
export async function getWalletReport(
  id: number | string,
  opts?: { from?: string; to?: string; period?: string }
): Promise<WalletReport> {
  const params = new URLSearchParams();
  if (opts?.from) params.append('from', opts.from);
  if (opts?.to) params.append('to', opts.to);
  if (opts?.period) params.append('period', opts.period);
  const qs = params.toString();
  const response = await fetch(`${API_URL}/wallets/${id}/report${qs ? `?${qs}` : ''}`);
  if (!response.ok) throw new Error('Failed to load wallet report');
  return response.json();
}

// Tasa efectiva para convertir a USD en el frontend
// ?type=bcv|paralelo&date=YYYY-MM-DD
export async function getEffectiveRate(type: 'bcv' | 'paralelo' = 'bcv', date?: string): Promise<{ date: string; rate: number | null; type: string }> {
  const params = new URLSearchParams();
  params.append('type', type);
  if (date) params.append('date', date);
  const response = await fetch(`${API_URL}/rates/effective?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to load effective rate');
  return response.json();
}

// Transactions API
export async function getTransactions(
  wallet_id?: number, 
  category?: string,
  date?: string
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (wallet_id) params.append('wallet_id', wallet_id.toString());
  if (category) params.append('category', category);
  if (date) params.append('date', date);
  
  const response = await fetch(`${API_URL}/transactions?${params}`);
  if (!response.ok) throw new Error('Failed to load transactions');
  return response.json();
}

// POST transaction API
export async function postTransaction(data: Transaction): Promise<Transaction> {
  const response = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to save transaction');
  return response.json();
}

// Exchange POST API
export async function postExchange(exchange: { 
  fromWalletId: number; 
  toWalletId: number; 
  fromAmount: number; 
  toAmount: number; 
  marketRate?: number; 
  description?: string; 
}): Promise<any> {
  const response = await fetch(`${API_URL}/exchanges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromWalletId: exchange.fromWalletId,
      toWalletId: exchange.toWalletId,
      fromAmount: exchange.fromAmount,
      toAmount: exchange.toAmount,
      marketRate: exchange.marketRate,
      description: exchange.description
    })
  });
  
  if (!response.ok) throw new Error('Exchange request failed');
  return response.json();
}

// Categories API
export interface Category {
  id: number;
  name: string;
  type: 'expense' | 'income';
  color?: string;
}

export async function getCategories(category_type?: 'expense' | 'income'): Promise<Category[]> {
  const params = new URLSearchParams();
  if (category_type) params.append('type', category_type);
  
  const response = await fetch(`${API_URL}/categories?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to get categories');
  return response.json();
}

// Balance API
export interface Balance {
  total: number;
  byCurrency: Record<string, number>;
  byWallet: Array<{
    walletId: number;
    walletName: string;
    currency: string;
    balance: number;
  }>;
}

export async function getBalance(): Promise<Balance> {
  const response = await fetch(`${API_URL}/balance`);
  if (!response.ok) throw new Error('Failed to load balance');
  return response.json();
}