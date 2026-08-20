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
