// src/routes/settings.js — Endpoints de preferencias compartidas (zona horaria).
const {
  getUserTimeZone,
  setUserTimeZone,
  DEFAULT_USER_TZ,
} = require('../services/settings');
const { isValidTimeZone } = require('../services/timeZoneMap');

module.exports = function registerSettingsRoutes(app, requireBrowserAuth) {
  // GET /api/settings → { user_timezone, defaults }
  app.get('/api/settings', async (req, res) => {
    try {
      const user_timezone = await getUserTimeZone();
      res.json({
        user_timezone,
        defaults: { user_timezone: DEFAULT_USER_TZ },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/settings/user_timezone → setea la zona del usuario.
  // Solo sesión de navegador (nunca un API token Bearer): es configuración
  // sensible que el token no debe poder tocar.
  app.put('/api/settings/user_timezone', requireBrowserAuth, async (req, res) => {
    try {
      const { timezone } = req.body || {};
      if (timezone != null && !isValidTimeZone(timezone)) {
        return res.status(400).json({ error: 'Zona horaria inválida (use un IANA timezone, ej: America/Caracas)' });
      }
      await setUserTimeZone(timezone || null);
      res.json({ user_timezone: timezone || DEFAULT_USER_TZ });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};