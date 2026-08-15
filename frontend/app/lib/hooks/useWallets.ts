import { useState, useEffect } from 'react';
import { API_URL } from '../api';

export interface Wallet {
  id: number;
  name: string;
  currency: string;
  balance: number;
  type: string;
}

export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWallets() {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/wallets`);
        if (!response.ok) {
          throw new Error('Failed to fetch wallets');
        }
        const data = await response.json();
        setWallets(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setWallets([]);
      } finally {
        setLoading(false);
      }
    }

    fetchWallets();
  }, []);

  return { wallets, loading, error };
}