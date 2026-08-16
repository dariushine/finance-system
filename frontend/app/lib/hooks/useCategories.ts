import { useState, useEffect, useCallback } from 'react';
import { getCategories, type Category } from '../api';

/** Categorías del sistema que no se muestran/editan en la UI normal. */
export function isSystemCategoryName(name?: string | null): boolean {
  return ['fee', 'exchange_out', 'exchange_in'].includes(String(name || ''));
}

/** Etiqueta legible a partir del nombre interno (ej: other_expense -> "Other Expense"). */
export function categoryLabel(name: string): string {
  return name
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Filtra las categorías de sistema fuera de una lista (para UI de usuario). */
export function filterSystemCategories(categories: Category[]): Category[] {
  return categories.filter((c) => !isSystemCategoryName(c.name));
}

export function useCategories(type?: 'expense' | 'income') {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCategories(type);
      // La UI de usuario no debe ver las categorías de sistema.
      setCategories(filterSystemCategories(data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar categorías');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { categories, loading, error, refetch };
}
