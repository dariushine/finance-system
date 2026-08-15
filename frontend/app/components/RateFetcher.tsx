'use client';

import { useEffect } from 'react';

// Al cargar la página, pide la tasa del día al backend.
// El backend: 1) la busca en BD, 2) si no existe la consulta a Dolarapi y la guarda,
// 3) si falla devuelve error (que se loguea aquí; el dashboard muestra el error real).
export default function RateFetcher() {
  useEffect(() => {
    fetch('/api/daily-rates/today')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('⚠️ No se pudo obtener la tasa del día:', body.error || res.status);
          return;
        }
        const { data } = await res.json();
        console.log(`📅 Tasa del día (${data.date}): BCV=${data.bcv}, Paralelo=${data.paralelo}${data.fromDb ? ' (desde BD)' : ' (desde API)'}`);
      })
      .catch((err) => {
        console.error('⚠️ Error al obtener tasa del día:', err.message);
      });
  }, []);

  return null;
}
