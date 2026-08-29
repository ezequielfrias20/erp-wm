import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loadJwks, withTimeout, isAuthTimeout } from "@/lib/supabase/jwks";

/**
 * Techo de la verificación de sesión dentro del proxy. El límite de invocación de
 * la plataforma es de decenas de segundos, así que cualquier cosa que se acerque
 * ahí ya es un 504 para el usuario: preferimos responder degradado en 3 s.
 */
const AUTH_TIMEOUT_MS = 3_000;

const PUBLIC_PATHS = ["/login", "/invite", "/api/bcv", "/.well-known"];

function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && name.includes("auth-token");
}

function isInvalidRefreshToken(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "refresh_token_not_found" ||
    e.message?.toLowerCase().includes("invalid refresh token") === true
  );
}

/** ¿Trae el navegador una cookie de sesión de Supabase? */
function hasAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => isSupabaseAuthCookie(c.name));
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    request.cookies.delete(cookie.name);
    response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
}

/** Refreshes the Supabase session cookie and gates app routes behind auth. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "missing-supabase-env");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      db: { schema: "wm" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // `getClaims()` verifica la firma del JWT contra las claves públicas del proyecto.
  // Las resolvemos nosotros (`loadJwks`) y se las pasamos hechas, para que no dispare
  // su propio `fetch` sin timeout al JWKS — ese era el origen del 504
  // MIDDLEWARE_INVOCATION_TIMEOUT al cobrar una venta. Aun así envolvemos la llamada
  // en `withTimeout`: `getSession()` puede necesitar refrescar el token contra
  // `/auth/v1/token`, que también viaja por red.
  let userId: string | null = null;
  let verified = true;

  // Sin cookie de sesión no hay nada que verificar: ni JWKS ni `getClaims()`. Es el
  // caso de todo visitante anónimo (y del propio /login), y así no paga red alguna.
  if (hasAuthCookie(request)) {
    const jwks = await loadJwks(supabaseUrl);

    if (jwks.status === "unreachable") {
      // Supabase Auth no contesta. Intentar `getClaims()` sólo añadiría otro plantón
      // por petición: damos la verificación por degradada sin salir a la red.
      verified = false;
    } else {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getClaims(
            undefined,
            jwks.status === "ok" ? { jwks: jwks.jwks } : undefined,
          ),
          AUTH_TIMEOUT_MS,
        );
        if (error) throw error;
        userId = data?.claims?.sub ? String(data.claims.sub) : null;
      } catch (error) {
        if (isInvalidRefreshToken(error)) {
          clearSupabaseAuthCookies(request, response);
        } else if (isAuthTimeout(error)) {
          verified = false;
        }
      }
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isReadNavigation = request.method === "GET" || request.method === "HEAD";

  // Con la verificación degradada, la presencia de la cookie basta para no cortar
  // la navegación; la autorización real sigue estando en la página y en RLS.
  const looksSignedIn = userId !== null || !verified;

  if (isReadNavigation && !looksSignedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isReadNavigation && userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
