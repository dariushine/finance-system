/**
 * Pruebas unitarias para el endpoint de health check
 * 
 * IMPORTANTE: Estas pruebas requieren que el servidor NO esté corriendo
 * durante la ejecución de las pruebas para evitar conflictos de puertos.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServer } = require('../exchange-server');

// Mock de la base de datos para evitar dependencias reales
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn().mockImplementation(() => ({
      serialize: jest.fn((cb) => cb()),
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      close: jest.fn()
    }))
  })
}));

describe('Health Check Endpoint', () => {
  let server: any;
  
  beforeAll(() => {
    // Crear una instancia del servidor para testing
    const app = createServer();
    server = app.listen(3003); // Puerto diferente para tests
  });
  
  afterAll(() => {
    server.close();
  });
  
  test('GET /api/health should return 200 and health status', async () => {
    const response = await request(server)
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /json/);
    
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('features');
    expect(response.body).toHaveProperty('note');
  });
  
  test('Health response should contain required features', async () => {
    const response = await request(server).get('/api/health');
    
    const expectedFeatures = ['wallets', 'transactions', 'exchanges', 'balance'];
    expectedFeatures.forEach(feature => {
      expect(response.body.features).toContain(feature);
    });
  });
  
  test('Health response should have valid timestamp', async () => {
    const response = await request(server).get('/api/health');
    const timestamp = new Date(response.body.timestamp);
    
    expect(timestamp instanceof Date).toBe(true);
    expect(isNaN(timestamp.getTime())).toBe(false);
  });
});

// Nota: Para ejecutar estas pruebas:
// 1. Asegurarse que no hay servidor corriendo en el puerto 3003
// 2. Ejecutar: npm test -- __tests__/health.test.ts
// 3. Verificar que todas las pruebas pasan
export {};
