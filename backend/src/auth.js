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

const shaHex = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// Adivina un nombre amigable de dispositivo a partir del User-Agent.
function guessDeviceName(ua = '') {
  const u = String(ua);
  if (/iphone|ipad/i.test(u)) return 'iPhone/iPad';
  if (/android/i.test(u)) return 'Android';
  if (/windows/i.test(u)) return 'Windows';
  if (/macintosh|mac os/i.test(u)) return 'Mac';
  if (/linux/i.test(u)) return 'Linux';
  if (/curl|wget/i.test(u)) return 'CLI (curl/wget)';
  return u ? 'Desconocido' : 'Navegador';
}

// Genera un id aleatorio legible para el token plano.
function randomTokenId() {
  return crypto.randomBytes(24).toString('hex');
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
      created_at INTEGER NOT NULL,
      user_agent TEXT,
      ip TEXT,
      device_name TEXT,
      last_used_at INTEGER
    )`);
  });

  async function saveToken(jti, token, issuedAtMs, expiresMs, meta = {}) {
    const tokenHash = sha(token).toString('hex');
    await dbRun(
      `INSERT INTO refresh_tokens (jti, token_hash, expires_at, created_at, user_agent, ip, device_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jti, tokenHash, expiresMs, issuedAtMs, meta.userAgent || null, meta.ip || null, meta.deviceName || null]
    );
  }

  async function findToken(jti) {
    return dbGet(
      `SELECT token_hash, expires_at FROM refresh_tokens WHERE jti = ?`,
      [jti]
    );
  }

  async function touchToken(jti, nowMs = Date.now()) {
    try {
      await dbRun(`UPDATE refresh_tokens SET last_used_at = ? WHERE jti = ?`, [nowMs, jti]);
    } catch (_e) { /* noop */ }
  }

  async function revokeToken(jti) {
    await dbRun(`DELETE FROM refresh_tokens WHERE jti = ?`, [jti]);
  }

  // Lista todas las sesiones (refresh tokens vigentes) con metadata.
  async function listSessions() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT jti, user_agent, ip, device_name, created_at, expires_at, last_used_at
         FROM refresh_tokens ORDER BY created_at DESC`,
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });
  }

  // Limpieza oportunista: borra refresh tokens ya vencidos.
  async function cleanupExpired(nowMs = Date.now()) {
    try {
      await dbRun(`DELETE FROM refresh_tokens WHERE expires_at <= ?`, [nowMs]);
    } catch (_e) {
      /* noop */
    }
  }

  return { saveToken, findToken, touchToken, revokeToken, listSessions, cleanupExpired };
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

  // ── API tokens (acceso programático) ────────────────────────────────────
  const tokenStore = {
    create: (name, tokenPlain, issuedAtMs, expiresMs) =>
      new Promise((resolve, reject) =>
        db.run(
          `INSERT INTO api_tokens (name, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?)`,
          [name, shaHex(tokenPlain), expiresMs, issuedAtMs],
          function (err) { err ? reject(err) : resolve(this.lastID); }
        )
      ),
    list: () =>
      new Promise((resolve, reject) =>
        db.all(
          `SELECT id, name, expires_at, created_at, last_used_at, is_active
           FROM api_tokens ORDER BY created_at DESC`,
          (err, rows) => (err ? reject(err) : resolve(rows || []))
        )
      ),
    findByHash: (hash) =>
      new Promise((resolve, reject) =>
        db.get(
          `SELECT id, expires_at, is_active FROM api_tokens WHERE token_hash = ? AND is_active = 1`,
          [hash],
          (err, row) => (err ? reject(err) : resolve(row))
        )
      ),
    revoke: (id) =>
      new Promise((resolve, reject) =>
        db.run(`UPDATE api_tokens SET is_active = 0 WHERE id = ?`, [id], (err) =>
          err ? reject(err) : resolve()
        )
      ),
    remove: (id) =>
      new Promise((resolve, reject) =>
        db.run(`DELETE FROM api_tokens WHERE id = ?`, [id], (err) =>
          err ? reject(err) : resolve()
        )
      ),
    touch: (id) =>
      new Promise((resolve) =>
        db.run(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`, [Date.now(), id], () =>
          resolve()
        )
      ),
  };

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
  async function issueRefreshToken(res, remember, req = null) {
    const now = Date.now();
    const maxAgeMs = remember ? REFRESH_LONG_MS : REFRESH_SHORT_MS;
    const jti = crypto.randomBytes(24).toString('hex');
    const token = jwt.sign({ jti, type: 'refresh' }, getTokenSecret(), {
      expiresIn: Math.floor(maxAgeMs / 1000),
    });
    const ua = req && req.headers ? String(req.headers['user-agent'] || '') : '';
    const meta = {
      userAgent: ua ? ua.slice(0, 300) : null,
      ip: req && (req.ip || (req.socket && req.socket.remoteAddress)) || null,
      deviceName: guessDeviceName(ua),
    };
    await store.saveToken(jti, token, now, now + maxAgeMs, meta);
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
      await issueRefreshToken(res, remember === true, req);
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
      await store.touchToken(jti);
      await store.revokeToken(jti);
      issueAccessToken(res);
      await issueRefreshToken(res, remember, req);
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

  // ── Gestión de sesiones (refresh tokens vigentes) ────────────────────────
  // Estos endpoints van bajo /api/auth (montado ANTES del requireAuth general),
  // así que se protegen aquí mismo exigiando una sesión de navegador (access
  // token en cookie httpOnly). No se operan por API token.
  const browserAuthed = (req) => {
    if (!authEnabled()) return true;
    const accessToken = req.cookies && req.cookies[ACCESS_COOKIE];
    if (!accessToken) return false;
    try {
      jwt.verify(accessToken, getTokenSecret());
      return true;
    } catch (_e) {
      return false;
    }
  };

  // GET /api/auth/sessions → lista de sesiones abiertas.
  router.get('/sessions', requireBrowserAuth, async (req, res) => {
    try {
      const rows = await store.listSessions();
      // Marcar la sesión actual: es el jti del refresh token de ESTA cookie.
      let currentJti = null;
      const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
      if (refreshToken) {
        try {
          const p = jwt.verify(refreshToken, getTokenSecret(), {
            ignoreExpiration: true,
          });
          currentJti = p && p.jti ? p.jti : null;
        } catch (_e) {
          currentJti = null;
        }
      }
      const sessions = (rows || []).map((s) => ({
        jti: s.jti,
        deviceName: s.device_name || 'Desconocido',
        userAgent: s.user_agent || '',
        ip: s.ip || null,
        createdAt: Number(s.created_at),
        expiresAt: Number(s.expires_at),
        lastUsedAt: s.last_used_at ? Number(s.last_used_at) : null,
        current: !!currentJti && currentJti === s.jti,
      }));
      res.json({ sessions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/auth/sessions/:jti → revoca una sesión (logout remoto).
  router.delete('/sessions/:jti', requireBrowserAuth, async (req, res) => {
    try {
      await store.revokeToken(req.params.jti);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── API tokens (acceso programático) ────────────────────────────────────

  // GET /api/auth/tokens → lista los API tokens (sin valor plano).
  router.get('/tokens', requireBrowserAuth, async (req, res) => {
    try {
      const rows = await tokenStore.list();
      const tokens = (rows || []).map((t) => ({
        id: t.id,
        name: t.name,
        expiresAt: t.expires_at ? Number(t.expires_at) : null,
        createdAt: Number(t.created_at),
        lastUsedAt: t.last_used_at ? Number(t.last_used_at) : null,
        isActive: !!t.is_active,
      }));
      res.json({ tokens });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/auth/tokens → crea un API token. Body: { name, expires_in }.
  // expires_in en segundos (null = sin expiración). Devuelve el valor plano UNA vez.
  router.post('/tokens', requireBrowserAuth, async (req, res) => {
    const { name, expires_in } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del token es obligatorio' });
    }
    let expiresMs = null;
    if (expires_in != null) {
      const secs = Number(expires_in);
      if (!Number.isFinite(secs) || secs <= 0) {
        return res.status(400).json({ error: 'expires_in debe ser un número de segundos mayor a 0' });
      }
      expiresMs = Date.now() + secs * 1000;
    }
    try {
      const plain = 'ftk_' + randomTokenId();
      const now = Date.now();
      const id = await tokenStore.create(name.trim(), plain, now, expiresMs);
      res.status(201).json({
        id,
        name: name.trim(),
        token: plain,
        expiresAt: expiresMs,
        note: 'Guarda este token ahora: no se mostrará de nuevo.',
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/auth/tokens/:id → revoca/borra un API token.
  router.delete('/tokens/:id', requireBrowserAuth, async (req, res) => {
    try {
      await tokenStore.remove(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Middleware de protección para /api/* ─────────────────────────────────
  function requireAuth(req, res, next) {
    if (!authEnabled()) return next(); // Auth deshabilitada en dev -> todo abierto

    // Acceso por API token (Authorization: Bearer <token>)
    const authHeader = req.headers && req.headers.authorization;
    if (authHeader && String(authHeader).startsWith('Bearer ')) {
      const plain = String(authHeader).slice(7).trim();
      if (plain) {
        (async () => {
          try {
            const found = await tokenStore.findByHash(shaHex(plain));
            if (found) {
              if (found.expires_at && Number(found.expires_at) < Date.now()) {
                return res.status(401).json({ error: 'API token expirado' });
              }
              tokenStore.touch(found.id);
              return next();
            }
          } catch (_e) { /* falla el pase a cookie */ }
          return res.status(401).json({ error: 'API token inválido' });
        })();
        return;
      }
    }

    const accessToken = req.cookies && req.cookies[ACCESS_COOKIE];
    if (!accessToken) return res.status(401).json({ error: 'No autorizado' });
    try {
      jwt.verify(accessToken, getTokenSecret());
      return next();
    } catch (_e) {
      return res.status(401).json({ error: 'Sesión expirada' });
    }
  }

  // Middleware para rutas que SOLO admite la sesión de navegador (cookies
  // httpOnly), nunca un API token Bearer: gestión de sesiones/tokens y
  // configuración sensible.
  function requireBrowserAuth(req, res, next) {
    if (!browserAuthed(req)) return res.status(401).json({ error: 'No autorizado' });
    next();
  }

  return { router, requireAuth, requireBrowserAuth };
}

module.exports = { createAuth, authEnabled };
