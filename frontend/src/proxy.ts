import { NextRequest, NextResponse } from 'next/server';

const ROLE_ROUTES: Record<string, string> = {
  '/admin':      'administrador',
  '/supervisor': 'supervisor',
  '/instructor': 'instructor',
};

const ROL_HOME: Record<string, string> = {
  'administrador': '/admin',
  'supervisor':    '/supervisor',
  'instructor':    '/instructor',
};

const AUTH_ROUTES = ['/cursos', '/curso', '/mis-cursos', '/certificados', '/perfil', '/pagos'];

// Llamada server-to-server para validar el JWT HttpOnly sin confiar en cookies JS.
// En dev: si el backend no está levantado, getSession devuelve null y el código
// usa las cookies de rol como fallback para no romper el entorno local.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';
const IS_DEV = process.env.NODE_ENV === 'development';

async function getSession(
  cookieHeader: string,
): Promise<{ rol: string; is_superuser: boolean } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/session`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ rol: string; is_superuser: boolean }>;
  } catch {
    return null;
  }
}

/**
 * El access token dura minutos; el refresh token, días. Si el navegador llega sin
 * access token pero con refresh token (p. ej. volvió tras 20 minutos, o abrió la
 * app al día siguiente con "Recordarme"), se renueva la sesión del lado del
 * servidor y se repite la misma petición con las cookies nuevas, en vez de
 * mandarlo al login.
 */
async function renovarSesion(request: NextRequest): Promise<NextResponse | null> {
  if (!request.cookies.get('refresh_token')?.value) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/login/refresh-token`, {
      method: 'POST',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const setCookies = res.headers.getSetCookie();
    const access = setCookies.find((c) => c.startsWith('access_token='))?.split(';')[0];
    const redirect = NextResponse.redirect(request.nextUrl);

    // Cookies de rol (las lee este proxy) alineadas con la sesión renovada.
    if (access) {
      const session = await getSession(access);
      if (session) {
        const persist = request.cookies.get('session_persist')?.value === '1';
        const opts = { path: '/', sameSite: 'strict' as const, secure: request.nextUrl.protocol === 'https:', ...(persist ? { maxAge: 60 * 60 * 24 * 30 } : {}) };
        redirect.cookies.set('user_rol', session.rol, opts);
        redirect.cookies.set('user_superuser', session.is_superuser ? '1' : '0', opts);
      }
    }
    // Al final: cookies.set() reescribe el encabezado set-cookie completo.
    for (const c of setCookies) redirect.headers.append('set-cookie', c);
    return redirect;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const httpsEnabled = process.env.ENABLE_HTTPS === 'true';
  return [
    "default-src 'self'",
    [
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      isDev ? "'unsafe-eval'" : '',
      'https://www.paypal.com https://www.paypalobjects.com',
    ].filter(Boolean).join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.b-cdn.net https://www.paypalobjects.com https://www.paypal.com https://t.paypal.com",
    "connect-src 'self' https://video.bunnycdn.com https://api-m.sandbox.paypal.com https://api-m.paypal.com https://www.paypal.com https://t.paypal.com https://*.sentry.io https://*.ingest.sentry.io",
    "frame-src https://iframe.mediadelivery.net https://www.paypal.com https://www.sandbox.paypal.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(httpsEnabled ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Pasar nonce a Server Components vía request header.
  // Next.js lee el nonce del header Content-Security-Policy del request para
  // aplicarlo a sus propios scripts de hidratación (chunks de /_next/static).
  // Sin este header en el request, los scripts salen sin nonce y 'strict-dynamic'
  // los bloquea. x-nonce queda disponible para uso propio de la app.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  function nextWithNonce(): NextResponse {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  function redirectWithCsp(url: URL): NextResponse {
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;

  // Sin access token pero con refresh token: renovar antes de decidir.
  const protegida =
    pathname === '/'
    || Object.keys(ROLE_ROUTES).some((p) => pathname.startsWith(p))
    || AUTH_ROUTES.some((p) => pathname.startsWith(p));
  if (!token && protegida) {
    const renovada = await renovarSesion(request);
    if (renovada) {
      renovada.headers.set('Content-Security-Policy', csp);
      return renovada;
    }
  }
  const userRol = request.cookies.get('user_rol')?.value;
  const isSuperuser = request.cookies.get('user_superuser')?.value === '1';

  // Login: redirigir a dashboard si ya tiene sesión activa
  if (pathname === '/') {
    if (token && userRol) {
      const home = ROL_HOME[userRol] ?? '/cursos';
      return redirectWithCsp(new URL(home, request.url));
    }
    return nextWithNonce();
  }

  // Rutas con rol específico — validación server-to-server contra JWT HttpOnly
  for (const [prefix, requiredRole] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(prefix)) {
      if (!token) {
        return redirectWithCsp(new URL('/?error=auth', request.url));
      }

      const cookieHeader = request.headers.get('cookie') ?? '';
      const session = await getSession(cookieHeader);

      if (!session) {
        // En dev: si el backend no responde, fallback a cookie para no bloquear el entorno local
        if (IS_DEV && userRol) {
          if (isSuperuser && prefix === '/admin') return nextWithNonce();
          if (userRol !== requiredRole) {
            const home = ROL_HOME[userRol] ?? '/cursos';
            return redirectWithCsp(new URL(`${home}?error=role`, request.url));
          }
          return nextWithNonce();
        }
        return redirectWithCsp(new URL('/?error=auth', request.url));
      }

      if (session.is_superuser && prefix === '/admin') return nextWithNonce();
      if (session.rol !== requiredRole) {
        const home = ROL_HOME[session.rol] ?? '/cursos';
        return redirectWithCsp(new URL(`${home}?error=role`, request.url));
      }
      return nextWithNonce();
    }
  }

  // Rutas que solo requieren sesión activa
  for (const route of AUTH_ROUTES) {
    if (pathname.startsWith(route)) {
      if (!token) {
        return redirectWithCsp(new URL('/?error=auth', request.url));
      }
      return nextWithNonce();
    }
  }

  return nextWithNonce();
}

export const config = {
  matcher: [
    {
      // Excluir: assets estáticos, archivos de imagen Y rutas /api/* (proxy al backend)
      // Las rutas /api/* no necesitan CSP ni guards de rol — son endpoints JSON.
      // Excluirlas evita que el middleware interfiera con los Set-Cookie del backend.
      source: '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
