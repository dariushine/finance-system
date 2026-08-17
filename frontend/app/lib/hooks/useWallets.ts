import { useState, useEffect, useCallback } from 'react';
import { API_URL, getEffectiveRate } from '../api';

export interface Wallet {
  id: number;
  name: string;
  alias?: string | null;
  currency: string;
  balance: number;
  type: string;
  color?: string | null;
  icon?: string | null;
  excludeFromTotal?: boolean;
  hideInDashboard?: boolean;
}

interface WalletWithUsd extends Wallet {
  usdValue?: number;
  rate?: number | null;
}

export function useWallets(rateType: 'bcv' | 'paralelo' = 'bcv') {
  const [wallets, setWallets] = useState<WalletWithUsd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    try {
      setLoading(true);
      const [walletsRes, rateRes]: [any, any] = await Promise.all([
        fetch(`${API_URL}/wallets`).then((r) => {
          if (!r.ok) throw new Error('Failed to fetch wallets');
          return r.json();
        }),
        getEffectiveRate(rateType).catch(() => ({ rate: null })),
      ]);

      const rate = rateRes?.rate ?? null;
      const enriched = (walletsRes as WalletWithUsd[]).map((w) => {
        let usdValue: number | undefined;
        if (w.currency !== 'USD' && rate) {
          usdValue = Number(w.balance) / rate;
        }
        return {
          ...w,
          usdValue,
          rate,
          excludeFromTotal: !!w.excludeFromTotal,
          hideInDashboard: !!w.hideInDashboard,
        };
      });

      setWallets(enriched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, [rateType]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  return { wallets, loading, error, refetch: fetchWallets };
}
