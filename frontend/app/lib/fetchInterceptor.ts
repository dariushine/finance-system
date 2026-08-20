// app/lib/fetchInterceptor.ts — Interceptor global de fetch.
//
// Refresca automáticamente el access token cuando una petición al /api devuelve
// 401 (access expirado) y reintenta UNA vez. Si el refresh falla, redirige a
// /login. Se instala UNA sola vez (en un componente cliente del layout);
// así NO hay que tocar cada llamada fetch de la app.
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

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
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
      // El access token expiró: intentamos renovarlo y reintentamos una vez.
      const ok = await refreshAccessToken();
      if (ok) {
        return originalFetch(input, init);
      }
      // El refresh también falló: sesión terminada -> login.
      redirectToLogin();
    }

    return res;
  };
}
