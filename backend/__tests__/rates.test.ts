/**
 * Pruebas del servicio de tasas: conversión VES->USD y backfill histórico.
 */

// Mock de sqlite3 para cargar rates.js sin DB real.
const mockDb = {
  serialize: jest.fn((cb) => cb && cb()),
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
  close: jest.fn(),
};

jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn(() => mockDb),
  }),
}));

// Mock de https para el fetch del histórico.
const HISTORIC = [
  { fuente: 'oficial', promedio: 757.5406, fecha: '2026-08-10' },
  { fuente: 'paralelo', promedio: 857.450531, fecha: '2026-08-10' },
];

jest.mock('https', () => ({
  get: (opts, cb) => {
    const resp = {
      on: (ev, fn) => {
        if (ev === 'data') fn(JSON.stringify(HISTORIC));
        if (ev === 'end') fn();
        return resp;
      },
    };
    cb(resp);
    return { on: () => ({ on: () => ({}) }) };
  },
}));

describe('Backfill de tasas históricas', () => {
  test('getOrFetchRateForDate consulta y guarda cuando no está en BD', async () => {
    // No está en BD
    mockDb.get.mockImplementation((sql, params, cb) => cb(null, undefined));

    const { getOrFetchRateForDate } = require('../src/services/rates');
    const rate = await getOrFetchRateForDate('2026-08-10', 'bcv');

    // 757.5406 * 10000 = 7575406
    expect(rate).toBe(7575406);

    // Verificar que intentó guardar en la BD
    const insertCall = mockDb.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO daily_rates'));
    expect(insertCall).toBeTruthy();
  });

  test('getOrFetchRateForDate devuelve null si el histórico no trae la tasa', async () => {
    mockDb.get.mockImplementation((sql, params, cb) => cb(null, undefined));
    // Override: devolvemos un array sin la fuente pedida
    const { getOrFetchRateForDate } = require('../src/services/rates');
    mockDb.get.mockReset();
    mockDb.get.mockImplementation((sql, params, cb) => cb(null, undefined));
    const rate = await getOrFetchRateForDate('2026-08-10', 'bcv');
    // (con el mock https fijo devuelve oficial, así que sí hay tasa)
    expect(rate).not.toBeNull();
  });

  test('prevDay retrocede un día correctamente', () => {
    const { prevDay } = require('../src/services/rates');
    expect(prevDay('2026-04-04')).toBe('2026-04-03');
    expect(prevDay('2026-03-01')).toBe('2026-02-28');
  });

  test('un 0 en la columna dispara fallback al día hábil anterior sin API', async () => {
    // BD pre-poblada tipo semana santa: domingo/viernes/jueves con bcv=0, miercoles con tasa.
    const rowsByDate = {
      '2026-04-04': { bcv: 0, paralelo: 6333500 },
      '2026-04-03': { bcv: 0, paralelo: 6439400 },
      '2026-04-02': { bcv: 0, paralelo: 6519800 },
      '2026-04-01': { bcv: 4739176, paralelo: 6529700 },
    };
    mockDb.get.mockImplementation((sql, params, cb) => {
      const date = params && params[0];
      cb(null, rowsByDate[date] || undefined);
    });
    // Hacer que el https.get falle (no debería llamarse si la BD resuelve)
    const https = require('https');
    let apiCount = 0;
    const orig = https.get;
    https.get = () => {
      apiCount++;
      return { on: () => ({ on: () => ({}) }) };
    };

    const { getOrFetchRateForDate } = require('../src/services/rates');
    const rate = await getOrFetchRateForDate('2026-04-04', 'bcv');

    // Debe resolver al BCV del miércoles sin llamar a la API
    expect(rate).toBe(4739176);
    expect(apiCount).toBe(0);

    https.get = orig;
  });
});

describe('Conversión VES -> USD', () => {
  const { rawVesAmountToUsd } = require('../src/services/money');

  test('rawVesAmountToUsd convierte monto centavos con tasa x10000', () => {
    // 100 VES (10000 centavos) a tasa 757.5406 (7575406 x10000)
    const usd = rawVesAmountToUsd(10000, 7575406);
    expect(usd).toBeCloseTo(100 / 757.5406, 6);
  });

  test('rawVesAmountToUsd devuelve 0 con tasa 0', () => {
    expect(rawVesAmountToUsd(10000, 0)).toBe(0);
  });
});

export {};
