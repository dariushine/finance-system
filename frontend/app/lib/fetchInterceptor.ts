import { isSessionDead, markSessionDead, clearSession } from './auth';

// app/lib/fetchInterceptor.ts — Interceptor global de fetch.
//
// Refresca automáticamente el access token cuando una petición al /api devuelve
// 401 (access expirado) y reintenta UNA vez. Si el refresh falla, limpia la
// sesión local y redirige a /login. Se instala UNA sola vez (en un componente
// cliente del layout); así NO hay que tocar cada llamada fetch de la app.
let installed = false;
let refreshing: Promise<boolean> | null = null;
let originalFetch: typeof fetch;

// Es una llamada de datos al backend (no una ruta de auth).
function isDataApi(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : (input as Request).url || '';
  return url.startsWith('/api') && !url.startsWith('/api/auth/');
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await originalFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Redirige a la raíz (login) UNA sola vez. Marca la sesión como muerta y limpia
// la marca local para que los intervalos de polling se detengan en vez de
// volver a disparar peticiones (evita el loop de errores al revocar la sesión
// desde otro sitio).
function redirectToLogin() {
  if (typeof window === 'undefined') return;
  markSessionDead();
  clearSession();
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

export function installFetchInterceptor() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);

    if (res.status === 401 && isDataApi(input)) {
      // La sesión ya se determinó muerta por otro llamada: no reintentes, deja
      // que el redirect (ya en curso) haga su trabajo.
      if (isSessionDead()) return res;

      // El access token expiró: intentamos renovarlo y reintentamos una vez.
      const ok = await refreshAccessToken();
      if (ok) {
        return originalFetch(input, init);
      }
      // El refresh también falló: sesión terminada -> login (una vez).
      redirectToLogin();
    }

    return res;
  };
}
