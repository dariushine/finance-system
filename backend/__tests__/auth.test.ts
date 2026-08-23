/**
 * Pruebas unitarias para el flujo de autenticación (auth.js).
 *
 * Ejecuta la app con AUTH_USERNAME/AUTH_PASSWORD definidas y verifica:
 *  - /api protegido devuelve 401 sin credenciales.
 *  - Login con credenciales malas -> 401.
 *  - Login bueno -> 200 + cookies httpOnly.
 *  - Con la cookie, /api responde 200.
 *  - Refresh rota la sesión.
 *  - Logout borra la sesión.
 */

// Mock funcional de sqlite3 (en memoria) para no tocar la DB real.
const refreshRows: Record<string, { token_hash: string; expires_at: number }> = {};

jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn().mockImplementation(() => {
      const store: Record<string, any> = {};
      return {
        serialize: jest.fn((cb) => cb()),
        run: jest.fn(function (sql: string, params: any[], cb?: Function) {
          // INSERT INTO refresh_tokens ...
          if (/INSERT INTO refresh_tokens/i.test(sql)) {
            const [jti, , expires_at] = params;
            refreshRows[String(jti)] = { token_hash: 'hash', expires_at: Number(expires_at) };
          }
          // DELETE FROM refresh_tokens
          if (/DELETE FROM refresh_tokens/i.test(sql)) {
            const [jti] = params;
            delete refreshRows[String(jti)];
          }
          if (typeof cb === 'function') cb.call({ lastID: 1, changes: 1 }, null);
        }),
        get: jest.fn((sql: string, params: any[], cb?: Function) => {
          if (/FROM refresh_tokens WHERE jti/i.test(sql)) {
            const row = refreshRows[String(params[0])];
            return cb(null, row || undefined);
          }
          if (typeof cb === 'function') cb(null, undefined);
        }),
        all: jest.fn((sql: string, params: any[], cb?: Function) => {
          if (typeof cb === 'function') cb(null, []);
        }),
        close: jest.fn(),
      };
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServer } = require('../exchange-server');

process.env.AUTH_USERNAME = 'admin';
process.env.AUTH_PASSWORD = 'secret123';
process.env.AUTH_TOKEN_SECRET = 'test-secret-0123456789-0123456789-0123456789';

function extractCookie(setCookie: string[] | undefined, name: string): string | null {
  const c = setCookie?.find((x) => x.startsWith(`${name}=`));
  return c ? c.split(';')[0] : null;
}

describe('Autenticación', () => {
  const app = createServer();

  it('protege /api sin cookie', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(401);
  });

  it('rechaza login con credenciales malas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('permite login bueno y accede a /api con la cookie', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' });
    expect(login.status).toBe(200);

    const access = extractCookie(login.headers['set-cookie'], 'finance_access');
    const refresh = extractCookie(login.headers['set-cookie'], 'finance_refresh');
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    expect(login.headers['set-cookie'].join(';')).toContain('HttpOnly');

    const ok = await request(app).get('/api/wallets').set('Cookie', `${access}; ${refresh}`);
    expect(ok.status).toBe(200);
  });

  it('renueva la sesión vía refresh', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' });
    const refresh = extractCookie(login.headers['set-cookie'], 'finance_refresh');

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refresh || '');
    expect(res.status).toBe(200);
  });

  it('cierra sesión con logout (revoca el refresh)', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' });
    const access = extractCookie(login.headers['set-cookie'], 'finance_access');
    const refresh = extractCookie(login.headers['set-cookie'], 'finance_refresh');

    const out = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${access}; ${refresh}`);
    expect(out.status).toBe(200);
    // Las cookies de sesión se limpian en el logout.
    expect(out.headers['set-cookie'].join(';')).toContain('finance_access=');
    expect(out.headers['set-cookie'].join(';')).toContain('finance_refresh=');

    // El refresh quedó revocado: usarlo de nuevo debe fallar (401).
    const refreshAfter = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refresh || '');
    expect(refreshAfter.status).toBe(401);
  });
});

export {};
