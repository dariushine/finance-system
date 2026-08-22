// app/lib/auth.ts — Cliente de autenticación.
//
// Centraliza login/logout/refresh y provee un `authFetch` que:
//  - Adjunta credenciales (mismas-origin → cookies httpOnly viajan solas).
//  - Si un /api responde 401, intenta renovar el access token vía refresh y
//    reintenta la petición una sola vez.
//  - Si el refresh falla, redirige a la raíz (login).
//
// La única marca de sesión visible al cliente es un flag en memoria/localStorage
// para mostrar/ocultar la UI; la seguridad real vive en las cookies httpOnly.

const SESSION_FLAG = 'finance_session';
// Marca “sesión muerta” para que el resto de la app (p. ej. los setInterval de
// polling) sepa que hubo un 401 + refresh fallido y se detenga antes de volver
// a disparar peticiones al API en loop.
const SESSION_DEAD_FLAG = 'finance_session_dead';

export async function login(username: string, password: string, remember: boolean): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password, remember }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'No se pudo iniciar sesión');
  }
  localStorage.setItem(SESSION_FLAG, '1');
  clearSessionDead();
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* aunque falle, se limpia el estado local */
  }
  localStorage.removeItem(SESSION_FLAG);
  clearSessionDead();
  window.location.href = '/';
}

// Renueva el access token a partir del refresh token. Devuelve true si ok.
export async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function hasLocalSession(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSION_FLAG) === '1';
}

// true cuando el refresh ya falló y decidimos que la sesión murió. Útil para
// que los intervalos de polling se limpien en vez de seguir reintentando.
export function isSessionDead(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSION_DEAD_FLAG) === '1';
}

export function markSessionDead(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_DEAD_FLAG, '1');
}

export function clearSessionDead(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_DEAD_FLAG);
}

export function markSession(): void {
  if (typeof window !== 'undefined') localStorage.setItem(SESSION_FLAG, '1');
}

export function clearSession(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(SESSION_FLAG);
}

/**
 * fetch de mismo-origen con auto-refresh del access token.
 *
 * El refresh/redirect lo maneja el interceptor global (fetchInterceptor.ts);
 * aquí solo centralizamos el mismo-origen y el header JSON para que todos los
 * clientes de la API usen la misma convención.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

/**
 * fetch con auto-refresh del access token.
 * - endpoint: ruta relativa bajo /api (ej. '/wallets').
 * - opciones estándar de fetch.
 */
export async function authFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(`/api${endpoint}`, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `API Error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
