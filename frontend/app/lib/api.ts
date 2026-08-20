// API service for the finance system
// Usa rewrites de Next.js: /api → backend:3002/api
import { apiFetch } from './auth';

export const API_URL = '/api';

// Settings (zona horaria) — GET /api/settings y PUT por clave.
// El backend SIEMPRE corre en UTC; solo la zona del usuario es configurable.
export interface Settings {
  user_timezone?: string | null;
  defaults?: { user_timezone?: string };
}

export async function getSettings(): Promise<Settings> {
  const response = await apiFetch(`${API_URL}/settings`);
  if (!response.ok) throw new Error('No se pudieron cargar las configuraciones');
  return response.json();
}

export async function setUserTimeZone(timezone: string): Promise<Settings> {
  const response = await apiFetch(`${API_URL}/settings/user_timezone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo guardar la zona horaria');
  return body;
}

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
  excludeFromTotal?: boolean;
  hideInDashboard?: boolean;
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

// Detalle de una transacción (GET /api/transactions/:id)
export interface TransactionDetail {
  id: number;
  walletId: number;
  walletName?: string;
  walletCurrency?: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  description?: string;
  date: string;
  /** Hora guardada por el usuario (HH:MM:SS) si la proporcionó */
  time?: string | null;
  fee?: number;
  parentTransactionId?: number | null;
  createdAt?: string;
  /** Saldo de la billetera después de aplicar esta transacción */
  balanceAfter?: number | null;
  /** Transacciones hijas (ej: fees de comisión) */
  children?: TransactionDetail[];
  /** true si esta transacción (o su cadena de padres) pertenece a un exchange */
  isExchangeMember?: boolean;
  /** id del exchange al que pertenece, si aplica */
  exchangeId?: number | null;
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
  createdAt?: string;
  /** Fecha seleccionada por el usuario (YYYY-MM-DD) si la puso */
  date?: string;
  /** Hora seleccionada por el usuario (HH:MM:SS) si la puso */
  time?: string | null;
}

// Detalle de un exchange (GET /api/exchanges/:id)
export interface ExchangeDetail {
  id: number;
  fromWalletId: number;
  toWalletId: number;
  fromAmount: number;
  toAmount: number;
  rate: number;
  fee?: number | null;
  description?: string;
  createdAt?: string;
  debitTransactionId: number;
  creditTransactionId: number;
  date?: string;
  time?: string | null;
  fromWalletName?: string;
  toWalletName?: string;
  fromCurrency?: string;
  toCurrency?: string;
}

// Wallets API
export async function getWallets(): Promise<Wallet[]> {
  const response = await apiFetch(`${API_URL}/wallets`);
  if (!response.ok) throw new Error('Failed to load wallets');
  return response.json();
}

// Obtener billeteras eliminadas (soft-delete)
export async function getDeletedWallets(): Promise<Wallet[]> {
  const response = await apiFetch(`${API_URL}/wallets/deleted`);
  if (!response.ok) throw new Error('Failed to load deleted wallets');
  return response.json();
}

// Obtener una billetera por id
export async function getWallet(id: number | string): Promise<Wallet> {
  const response = await apiFetch(`${API_URL}/wallets/${id}`);
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
  excludeFromTotal?: boolean;
  hideInDashboard?: boolean;
}

// Crear una billetera
export async function createWallet(data: WalletInput): Promise<Wallet> {
  const response = await apiFetch(`${API_URL}/wallets`, {
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
  const response = await apiFetch(`${API_URL}/wallets/${id}`, {
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
  const response = await apiFetch(`${API_URL}/wallets/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete wallet');
  return response.json();
}

// Reactivar una billetera
export async function reactivateWallet(id: number | string): Promise<Wallet> {
  const response = await apiFetch(`${API_URL}/wallets/${id}/reactivate`, { method: 'PUT' });
  if (!response.ok) throw new Error('Failed to reactivate wallet');
  return response.json();
}

export interface WalletTransaction {
  id: number;
  type: 'expense' | 'income';
  amount: number;
  description?: string;
  date: string;
  /** Hora (HH:MM) en la zona del usuario, la manda el backend proyectada. */
  time?: string | null;
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
  opts?: { from?: string; to?: string; period?: string; tz?: string }
): Promise<WalletReport> {
  const params = new URLSearchParams();
  if (opts?.from) params.append('from', opts.from);
  if (opts?.to) params.append('to', opts.to);
  if (opts?.period) params.append('period', opts.period);
  if (opts?.tz) params.append('tz', opts.tz);
  const qs = params.toString();
  const response = await apiFetch(`${API_URL}/wallets/${id}/report${qs ? `?${qs}` : ''}`);
  if (!response.ok) throw new Error('Failed to load wallet report');
  return response.json();
}

// Tasa efectiva para convertir a USD en el frontend
// ?type=bcv|paralelo&date=YYYY-MM-DD
export async function getEffectiveRate(type: 'bcv' | 'paralelo' = 'bcv', date?: string): Promise<{ date: string; rate: number | null; type: string }> {
  const params = new URLSearchParams();
  params.append('type', type);
  if (date) params.append('date', date);
  const response = await apiFetch(`${API_URL}/rates/effective?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to load effective rate');
  return response.json();
}

// Transactions API
export async function getTransactions(
  wallet_id?: number, 
  category?: string,
  date?: string,
  tz?: string
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (wallet_id) params.append('wallet_id', wallet_id.toString());
  if (category) params.append('category', category);
  if (date) params.append('date', date);
  if (tz) params.append('tz', tz);
  
  const response = await apiFetch(`${API_URL}/transactions?${params}`);
  if (!response.ok) throw new Error('Failed to load transactions');
  return response.json();
}

// Obtener el detalle de una transacción (incluye balanceAfter y transacciones hijas)
export async function getTransaction(id: number | string, tz?: string): Promise<TransactionDetail> {
  const qs = tz ? `?tz=${encodeURIComponent(tz)}` : '';
  const response = await apiFetch(`${API_URL}/transactions/${id}${qs}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'No se pudo cargar la transacción');
  }
  return response.json();
}

// Editar una transacción (descripción, monto, fecha, categoría)
export async function updateTransaction(
  id: number | string,
  data: { description?: string; amount?: number; date?: string; time?: string; categoryName?: string },
  tz?: string
): Promise<any> {
  const response = await apiFetch(`${API_URL}/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tz ? { ...data, tz } : data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo editar la transacción');
  return body;
}

// Eliminar virtualmente una transacción
async function deleteTransaction(id: number | string): Promise<any> {
  const response = await apiFetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo eliminar la transacción');
  return body;
}

// Agregar una comisión (fee) a una transacción
export async function addTransactionFee(
  id: number | string,
  data: { amount: number; date?: string; time?: string },
  tz?: string
): Promise<any> {
  const response = await apiFetch(`${API_URL}/transactions/${id}/fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tz ? { ...data, tz } : data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo agregar la comisión');
  return body;
}

// Crear una transacción asociada (hija)
export async function createAssociatedTransaction(
  id: number | string,
  data: { amount: number; type: 'income' | 'expense'; categoryName: string; description?: string; date?: string; time?: string },
  tz?: string
): Promise<any> {
  const response = await apiFetch(`${API_URL}/transactions/${id}/associate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tz ? { ...data, tz } : data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo crear la transacción asociada');
  return body;
}

export { deleteTransaction };

// Obtener detalle de un exchange (GET /api/exchanges/:id)
export async function getExchange(id: number | string, tz?: string): Promise<ExchangeDetail> {
  const qs = tz ? `?tz=${encodeURIComponent(tz)}` : '';
  const response = await apiFetch(`${API_URL}/exchanges/${id}${qs}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'No se pudo cargar el exchange');
  }
  return response.json();
}

// Editar un exchange (montos, fee, fecha/hora, descripción). Billeteras fijas.
export async function updateExchange(
  id: number | string,
  data: { fromAmount?: number; toAmount?: number; fee?: number; description?: string; date?: string; time?: string },
  tz?: string
): Promise<any> {
  const response = await apiFetch(`${API_URL}/exchanges/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tz ? { ...data, tz } : data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo editar el exchange');
  return body;
}

// Eliminar virtualmente un exchange (soft-delete)
export async function deleteExchange(id: number | string): Promise<any> {
  const response = await apiFetch(`${API_URL}/exchanges/${id}`, { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo eliminar el exchange');
  return body;
}

// POST transaction API
export async function postTransaction(data: Transaction, tz?: string): Promise<Transaction> {
  const response = await apiFetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tz ? { ...data, tz } : data)
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
  date?: string; 
  time?: string; 
}, tz?: string): Promise<any> {
  const response = await apiFetch(`${API_URL}/exchanges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromWalletId: exchange.fromWalletId,
      toWalletId: exchange.toWalletId,
      fromAmount: exchange.fromAmount,
      toAmount: exchange.toAmount,
      marketRate: exchange.marketRate,
      description: exchange.description,
      date: exchange.date,
      time: exchange.time,
      ...(tz ? { tz } : {}),
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
  icon?: string | null;
  isActive?: boolean;
}

export interface CategoryInput {
  name: string;
  type: 'expense' | 'income';
  color?: string;
  icon?: string;
}

export async function getCategories(category_type?: 'expense' | 'income', opts?: { includingInactive?: boolean }): Promise<Category[]> {
  const params = new URLSearchParams();
  if (category_type) params.append('type', category_type);
  if (opts?.includingInactive) params.append('includingInactive', '1');
  const response = await apiFetch(`${API_URL}/categories?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to get categories');
  return response.json();
}

export async function createCategory(data: CategoryInput): Promise<Category> {
  const response = await apiFetch(`${API_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo crear la categoría');
  return body;
}

export async function updateCategory(id: number | string, data: Partial<CategoryInput>): Promise<Category> {
  const response = await apiFetch(`${API_URL}/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo actualizar la categoría');
  return body;
}

export async function deleteCategory(id: number | string): Promise<any> {
  const response = await apiFetch(`${API_URL}/categories/${id}`, { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo desactivar la categoría');
  return body;
}

export async function reactivateCategory(id: number | string): Promise<Category> {
  const response = await apiFetch(`${API_URL}/categories/${id}/reactivate`, { method: 'PUT' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo reactivar la categoría');
  return body;
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
  const response = await apiFetch(`${API_URL}/balance`);
  if (!response.ok) throw new Error('Failed to load balance');
  return response.json();
}

// Recurring Payments API

export interface RecurringPayment {
  id: number;
  name: string;
  description?: string | null;
  amount: number;
  fee?: number | null;
  currency: string;
  type: 'income' | 'expense';
  categoryId: number;
  categoryName: string;
  walletId?: number | null;
  walletName?: string | null;
  walletCurrency?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecurringPaymentInput {
  name: string;
  description?: string;
  amount: number;
  fee?: number;
  currency: string;
  type: 'income' | 'expense';
  categoryId: number;
  walletId?: number | null;
}

export async function getRecurringPayments(): Promise<RecurringPayment[]> {
  const response = await apiFetch(`${API_URL}/recurring-payments`);
  if (!response.ok) throw new Error('Failed to load recurring payments');
  return response.json();
}

export async function getRecurringPayment(id: number | string): Promise<RecurringPayment> {
  const response = await apiFetch(`${API_URL}/recurring-payments/${id}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'No se pudo cargar el pago frecuente');
  }
  return response.json();
}

export async function createRecurringPayment(data: RecurringPaymentInput): Promise<RecurringPayment> {
  const response = await apiFetch(`${API_URL}/recurring-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo crear el pago frecuente');
  return body;
}

export async function updateRecurringPayment(
  id: number | string,
  data: Partial<RecurringPaymentInput>
): Promise<RecurringPayment> {
  const response = await apiFetch(`${API_URL}/recurring-payments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo actualizar el pago frecuente');
  return body;
}

export async function deleteRecurringPayment(id: number | string): Promise<any> {
  const response = await apiFetch(`${API_URL}/recurring-payments/${id}`, { method: 'DELETE' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo eliminar el pago frecuente');
  return body;
}

export interface ExecuteRecurringInput {
  date?: string;
  time?: string;
  tz?: string;
  overrideAmount?: number;
  overrideFee?: number;
  overrideCategoryName?: string;
  overrideWalletId?: number;
  description?: string;
}

// Crear una transacción real a partir del pago frecuente (prellenado editable).
export async function executeRecurringPayment(
  id: number | string,
  data: ExecuteRecurringInput
): Promise<{ success: boolean; transaction: { id: number; type: string; amount: number; currency: string } }> {
  const response = await apiFetch(`${API_URL}/recurring-payments/${id}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'No se pudo realizar el pago frecuente');
  return body;
}
