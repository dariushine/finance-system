// src/auth.js — Autenticación y autorización (rehecho sobre main, ago 2026).
//
// Acceso por sesión con ACCESS TOKEN (corta vida) + REFRESH TOKEN (rotación),
// ambos como cookies httpOnly para que no sean legibles desde JS (inmunes a XSS).
//
//  - Access token  -> JWT, expira en ACCESS_TOKEN_TTL_MS (default 5 min).
//                     Cookie httpOnly `finance_access`. Protege los /api/* .
//  - Refresh token -> JWT con `jti`, persistido en SQLite para poder revocarlo
//                     y rotarlo. Cookie httpOnly `finance_refresh`.
//                     Vida: sin "recuérdame" = 1h; con "recuérdame" = 30 días.
//
// Flujo:
//  - POST /api/auth/login   : valida credenciales -> emite access + refresh.
//  - POST /api/auth/refresh : valida el refresh (firma + BD), lo rota y emite
//                             un access nuevo.
//  - POST /api/auth/logout  : revoca el refresh y borra ambas cookies.
//  - GET  /api/auth/session : devuelve si hay sesión válida (usa el front).
//
// Credenciales (variables de entorno; NUNCA fijas en código):
//   AUTH_USERNAME   -> usuario permitido
//   AUTH_PASSWORD   -> password permitido
//   AUTH_TOKEN_SECRET -> secreto para firmar los JWT (>= 32 chars recomendado)
//
// Si AUTH_USERNAME / AUTH_PASSWORD no están definidas, la autenticación queda
// DISABLED (todo abierto) para no romper el desarrollo local.
// ============================================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_COOKIE = 'finance_access';
const REFRESH_COOKIE = 'finance_refresh';

const ACCESS_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL_MS) || 5 * 60 * 1000; // 5 min
const REFRESH_SHORT_MS = Number(process.env.REFRESH_TTL_SHORT_MS) || 60 * 60 * 1000; // 1 h
const REFRESH_LONG_MS = Number(process.env.REFRESH_TTL_LONG_MS) || 30 * 24 * 60 * 60 * 1000; // 30 días

function getCredentials() {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  return {
    username: typeof username === 'string' && username !== '' ? username : null,
    password: typeof password === 'string' && password !== '' ? password : null,
  };
}

function getTokenSecret() {
  return process.env.AUTH_TOKEN_SECRET || 'dev-insecure-secret-change-me';
}

function authEnabled() {
  const c = getCredentials();
  return !!(c.username && c.password);
}

function cookieSecure() {
  // Solo sobre HTTPS. El despliegue actual es HTTP plano por Tailscale.
  return process.env.AUTH_COOKIE_SECURE === 'true';
}

function sha(v) {
  return crypto.createHash('sha256').update(String(v)).digest();
}

// Comparación a tiempo constante para mitigar timing attacks.
function safeEqual(a, b) {
  const ha = sha(a);
  const hb = sha(b);
  return ha.length === hb.length && crypto.timingSafeEqual(ha, hb);
}

// ── Helpers de cookies ──────────────────────────────────────────────────────
function baseCookieOptions() {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
  };
  return opts;
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: ACCESS_TTL_MS,
  });
}

function setRefreshCookie(res, token, maxAgeMs) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: maxAgeMs,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

// ── Persistencia de refresh tokens en SQLite ───────────────────────────────
function createTokenStore(db) {
  const dbRun = (sql, params) =>
    new Promise((resolve, reject) =>
      db.run(sql, params, function (err) {
        err ? reject(err) : resolve(this);
      })
    );
  const dbGet = (sql, params) =>
    new Promise((resolve, reject) =>
      db.get(sql, params, (err, row) =>
        err ? reject(err) : resolve(row)
      )
    );

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  });

  async function saveToken(jti, token, issuedAtMs, expiresMs) {
    const tokenHash = sha(token).toString('hex');
    await dbRun(
      `INSERT INTO refresh_tokens (jti, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [jti, tokenHash, expiresMs, issuedAtMs]
    );
  }

  async function findToken(jti) {
    return dbGet(
      `SELECT token_hash, expires_at FROM refresh_tokens WHERE jti = ?`,
      [jti]
    );
  }

  async function revokeToken(jti) {
    await dbRun(`DELETE FROM refresh_tokens WHERE jti = ?`, [jti]);
  }

  // Limpieza oportunista: borra refresh tokens ya vencidos.
  async function cleanupExpired(nowMs = Date.now()) {
    try {
      await dbRun(`DELETE FROM refresh_tokens WHERE expires_at <= ?`, [nowMs]);
    } catch (_e) {
      /* noop */
    }
  }

  return { saveToken, findToken, revokeToken, cleanupExpired };
}

// ── Rate-limit simple en memoria para el login (mitiga fuerza bruta) ────────
// Cuenta intentos fallidos por IP en una ventana; al superar el umbral devuelve
// 429. Suficiente para una app single-user self-hosted.
function createLoginLimiter() {
  const attempts = new Map();
  const WINDOW_MS = 15 * 60 * 1000; // 15 min
  const MAX_FAILS = 10;
  const key = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  // Devuelve { blocked } tras registrar un intento fallido.
  function recordFailure(req) {
    const k = key(req);
    const now = Date.now();
    const rec = attempts.get(k) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > rec.resetAt) {
      rec.count = 0;
      rec.resetAt = now + WINDOW_MS;
    }
    rec.count += 1;
    attempts.set(k, rec);
    return rec.count >= MAX_FAILS;
  }

  // Middleware que corta el login si ya está bloqueado por intentos previos.
  function middleware(req, res, next) {
    const k = key(req);
    const now = Date.now();
    const rec = attempts.get(k);
    if (rec && now <= rec.resetAt && rec.count >= MAX_FAILS) {
      return res
        .status(429)
        .json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
    }
    next();
  }

  return { middleware, recordFailure };
}

// ── Factory: crea el router de auth y el middleware de protección ──────────
function createAuth(db) {
  const store = createTokenStore(db);
  const router = require('express').Router();
  const { middleware: loginRateLimit, recordFailure } = createLoginLimiter();

  // Genera un access token JWT y lo pone como cookie.
  function issueAccessToken(res) {
    const payload = { sub: 'user', role: 'user' };
    const token = jwt.sign(payload, getTokenSecret(), {
      expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    });
    setAccessCookie(res, token);
    return token;
  }

  // Genera, persiste y emite un refresh token.
  async function issueRefreshToken(res, remember) {
    const now = Date.now();
    const maxAgeMs = remember ? REFRESH_LONG_MS : REFRESH_SHORT_MS;
    const jti = crypto.randomBytes(24).toString('hex');
    const token = jwt.sign({ jti, type: 'refresh' }, getTokenSecret(), {
      expiresIn: Math.floor(maxAgeMs / 1000),
    });
    await store.saveToken(jti, token, now, now + maxAgeMs);
    setRefreshCookie(res, token, maxAgeMs);
    return token;
  }

  // Login
  router.post('/login', loginRateLimit, async (req, res) => {
    const creds = getCredentials();
    if (!creds.username || !creds.password) {
      return res
        .status(503)
        .json({ error: 'Autenticación no configurada en el servidor' });
    }

    const { username, password, remember } = req.body || {};
    const bad = !(
      typeof username === 'string' &&
      typeof password === 'string' &&
      safeEqual(username, creds.username) &&
      safeEqual(password, creds.password)
    );
    if (bad) {
      const blocked = recordFailure(req);
      if (blocked) {
        return res
          .status(429)
          .json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    try {
      issueAccessToken(res);
      await issueRefreshToken(res, remember === true);
      store.cleanupExpired();
      res.json({ ok: true });
    } catch (e) {
      console.error('AUTH LOGIN ERROR:', e);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  });

  // Refresh: rota el refresh token y emite un access nuevo.
  router.post('/refresh', async (req, res) => {
    const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ error: 'Sin sesión' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, getTokenSecret());
    } catch (_e) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    const jti = payload && payload.jti;
    if (!jti) return res.status(401).json({ error: 'Sesión inválida' });

    try {
      const stored = await store.findToken(jti);
      if (!stored) return res.status(401).json({ error: 'Sesión revocada' });
      if (Number(stored.expires_at) < Date.now()) {
        await store.revokeToken(jti);
        return res.status(401).json({ error: 'Sesión expirada' });
      }

      // Rotación: revoca el token usado y emite uno nuevo con la misma duración.
      const remember = Number(stored.expires_at) > Date.now() + REFRESH_SHORT_MS;
      await store.revokeToken(jti);
      issueAccessToken(res);
      await issueRefreshToken(res, remember);
      store.cleanupExpired();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Error al renovar sesión' });
    }
  });

  // Logout
  router.post('/logout', async (req, res) => {
    const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, getTokenSecret(), {
          ignoreExpiration: true,
        });
        if (payload && payload.jti) await store.revokeToken(payload.jti);
      } catch (_e) {
        /* token inválido: simplemente se limpian cookies */
      }
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  // Session: permite que el front sepa si tiene una sesión válida sin duplicar
  // la lógica del refresh. Solo valida el access token presente.
  router.get('/session', (req, res) => {
    if (!authEnabled()) return res.json({ authenticated: false, disabled: true });
    const accessToken = req.cookies && req.cookies[ACCESS_COOKIE];
    if (!accessToken) return res.json({ authenticated: false });
    try {
      jwt.verify(accessToken, getTokenSecret());
      return res.json({ authenticated: true });
    } catch (_e) {
      return res.json({ authenticated: false });
    }
  });

  // ── Middleware de protección para /api/* ─────────────────────────────────
  function requireAuth(req, res, next) {
    if (!authEnabled()) return next(); // Auth deshabilitada en dev -> todo abierto

    const accessToken = req.cookies && req.cookies[ACCESS_COOKIE];
    if (!accessToken) return res.status(401).json({ error: 'No autorizado' });
    try {
      jwt.verify(accessToken, getTokenSecret());
      return next();
    } catch (_e) {
      return res.status(401).json({ error: 'Sesión expirada' });
    }
  }

  return { router, requireAuth };
}

module.exports = { createAuth, authEnabled };
