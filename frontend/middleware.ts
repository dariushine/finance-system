// middleware.ts — Protege las páginas del dashboard.
//
// Verifica el REFRESH TOKEN (cookie httpOnly `finance_refresh`, vida 1h/30d),
// NO el access token (que dura 5 min y se renueva automáticamente en el cliente
// vía el interceptor de fetch). Así navegar con el access expirado NO te bota:
// la página carga y el primer llamado /api renueva el access en segundo plano.
//
// Si la autenticación está deshabilitada (sin AUTH_USERNAME/AUTH_PASSWORD),
// deja pasar todo (dev local).
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const REFRESH_COOKIE = 'finance_refresh';
const secret = new TextEncoder().encode(
  process.env.AUTH_TOKEN_SECRET || 'dev-insecure-secret-change-me'
);

function authEnabled() {
  const u = process.env.AUTH_USERNAME;
  const p = process.env.AUTH_PASSWORD;
  return typeof u === 'string' && u !== '' && typeof p === 'string' && p !== '';
}

async function hasValidRefresh(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.type === 'refresh';
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // La página de login siempre es accesible (y redirige si ya hay sesión).
  if (pathname === '/login') {
    if (!authEnabled()) return NextResponse.next();
    if (await hasValidRefresh(req)) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // Estáticos / API / assets no se bloquean a nivel de página (el backend
  // protege el /api con el access token).
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (!authEnabled()) return NextResponse.next();

  if (!(await hasValidRefresh(req))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
