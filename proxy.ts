import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    {
      /*
       * Match all request paths except static assets and image files.
       */
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|svg|png|jpg|jpeg|gif|webp|avif|woff|woff2|ttf|otf|css|txt|webmanifest)$).*)",
      /*
       * El sidebar dispara un prefetch por cada enlace que roza el ratón, y cada
       * uno pasaba por aquí pagando una verificación de sesión. Multiplicaba las
       * invocaciones del proxy sin gatear nada nuevo: un prefetch sólo calienta la
       * caché del router, y la página que devuelve ya comprueba la sesión por su
       * cuenta (`app/(app)/layout.tsx` redirige a /login si no hay). Los dejamos
       * pasar de largo.
       */
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
