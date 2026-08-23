// Utilidades de dinero: montos en enteros (×100 centavos), tasas en ×10000.
// Según decisión de Freddy (19 ago 2026): montos ×100, tasas ×10000.

// unidades (ej 1.50) → entero de centavos (150)
export function toInt(units: number): number {
  return Math.round(Number(units) * 100);
}

// entero de centavos (150) → unidades (1.5)
export function toNum(int: number): number {
  return Number(int) / 100;
}

// unidades → entero de tasa ×10000
export function toRateInt(units: number): number {
  return Math.round(Number(units) * 10000);
}

// entero de tasa ×10000 → unidades
export function toRateNum(int: number): number {
  return Number(int) / 10000;
}
