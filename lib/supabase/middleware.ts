import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // `getClaims()` verifica la firma del JWT en local contra la JWKS del proyecto
  // (claves asimétricas). Antes esto era `getUser()`, que hacía una petición a
  // `/auth/v1/user` (~200 ms) en CADA request — incluidos los prefetch que dispara
  // el sidebar al pasar el ratón. `getSession()`, que getClaims usa por dentro, sigue
  // refrescando la cookie cuando el token está vencido.
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) throw error;
    userId = data?.claims?.sub ? String(data.claims.sub) : null;
  } catch (error) {
    if (isInvalidRefreshToken(error)) {
      clearSupabaseAuthCookies(request, response);
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isReadNavigation = request.method === "GET" || request.method === "HEAD";

  if (isReadNavigation && !userId && !isPublic) {
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
