const API_BASE = 'http://localhost:3002/api';

export interface Transaction {
  id: number;
  wallet_id: number;
  amount: number;
  currency: string;
  description: string;
  type: 'income' | 'expense';
  created_at: string;
}

export interface Wallet {
  id: number;
  name: string;
  currency: string;
  balance: number;
  color: string;
}

export interface Exchange {
  id: number;
  from_amount: number;
  from_currency: string;
  to_amount: number;
  to_currency: string;
  rate: number;
  created_at: string;
}

export interface Stats {
  total_income: number;
  total_expense: number;
  net_balance: number;
  transaction_count: number;
}

class FinanceApi {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Transactions
  async getTransactions(page = 1, limit = 20): Promise<Transaction[]> {
    return this.fetch(`/transactions?page=${page}&limit=${limit}`);
  }

  async getTransaction(id: number): Promise<Transaction> {
    return this.fetch(`/transactions/${id}`);
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'created_at'>): Promise<Transaction> {
    return this.fetch('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Wallets
  async getWallets(): Promise<Wallet[]> {
    return this.fetch('/wallets');
  }

  async getWallet(id: number): Promise<Wallet> {
    return this.fetch(`/wallets/${id}`);
  }

  // Stats
  async getStats(): Promise<Stats> {
    return this.fetch('/stats');
  }

  // Exchanges
  async getExchanges(): Promise<Exchange[]> {
    return this.fetch('/exchanges');
  }

  async createExchange(data: Omit<Exchange, 'id' | 'created_at'>): Promise<Exchange> {
    return this.fetch('/exchanges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Health
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    return this.fetch('/health');
  }
}

export const financeApi = new FinanceApi();