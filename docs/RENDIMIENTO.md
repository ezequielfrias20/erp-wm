# Rendimiento

## El problema de fondo

Cada llamada a PostgREST desde el servidor cuesta **~200 ms** (medido contra
`us-west-1`: ~100 ms de TLS en el borde + ~180 ms hasta el origen; con keep-alive
quedan ~200 ms por consulta). Con esa cifra, lo que decide la velocidad de una vista
no es el volumen de datos —la base es pequeña: ~440 ventas, ~940 filas de
inventario— sino **cuántas idas y vueltas van en serie**.

La regla práctica: una vista debe hacer **una sola tanda** de consultas en paralelo.
Cada `await` encadenado que no dependa de verdad del anterior son 200 ms regalados.

## Migraciones

Aplicar con el runner, que las corre en orden y verifica el resultado:

```bash
./supabase/apply_performance.sh "postgresql://postgres.<ref>:<password>@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

Usar el puerto **5432** (session mode). El 6543 es el pooler transaccional y los
índices `CONCURRENTLY` no pueden correr ahí. La cadena está en Supabase → Project
Settings → Database → Connection string.

Orden y motivo:

1. `sales_commissions.sql` — `profiles.commission_pct` y `sales.seller_commission_pct`.
   Sin ellas, Reportes ejecuta **cada consulta dos veces** (intento + reintento).
2. `create_sale_tax_included.sql` — IVA incluido en el precio final e idempotencia
   de ventas por `request_id` (advisory lock por usuario/UUID: un doble envío
   devuelve la venta original sin volver a descontar inventario).
3. `performance_indexes.sql` — índices compuestos y las RPC
   `inventory_status_counts`, `report_payments`, `write_audit`.
4. `session_bootstrap.sql` — perfil + permisos en una sola llamada.

Todos son idempotentes; se pueden repetir sin daño.

### Los caminos de respaldo ya no cuestan en cada petición

El código tolera que estas migraciones no estén aplicadas todavía, pero
`lib/db-capabilities.ts` **recuerda por proceso** qué objetos faltan. Antes, cada
petición gastaba un viaje de red en una RPC que iba a fallar y sólo después tomaba
el camino lento. Ahora ese intento se paga una vez y caduca a los 5 minutos, así
que tras aplicar el SQL el sistema se recupera solo sin redespliegue.

Cuando la Fase 1 esté aplicada y estable, conviene **quitar** esos respaldos: si no,
vuelven a ser una bomba de latencia silenciosa la próxima vez que el esquema y el
código se desincronicen.

## Sesión: cero viajes de red

`getClaims()` verifica la firma del JWT **en local** contra la JWKS del proyecto
(claves asimétricas ES256, ya activas). Antes se usaba `getUser()`, que golpea
`/auth/v1/user` en cada petición, y se llamaba dos veces por navegación (el proxy y
la página). Perfil y permisos vienen de una sola RPC y se memorizan en el proceso
con TTL corto (`lib/server-cache.ts`).

La invalidación es explícita: editar un usuario o cambiar un permiso tira la entrada
correspondiente (`invalidateSessionCache`), y las acciones de marca llaman a
`invalidateBrandingCache`. El TTL corto (30 s para sesión) cubre las instancias que
no atendieron el cambio.

## Cliente: las librerías pesadas van bajo demanda

| ruta | antes | ahora | qué se movió |
|---|---|---|---|
| `/reportes` | ~1725 KB | 285 KB | `@react-pdf/renderer` al pulsar «PDF» |
| `/inventario` | ~1197 KB | 284 KB | `exceljs` al exportar o importar |
| `/productos` | ~1213 KB | 300 KB | `exceljs` al exportar o importar |
| `/dashboard` | ~636 KB | 273 KB | `recharts` vía `next/dynamic` |

(JS sin comprimir por ruta.) `lib/excel-lazy.ts` y
`components/dashboard/charts-lazy.tsx` son los puntos de carga diferida; el PDF se
importa dentro del propio handler.

Al añadir una dependencia grande a un componente de cliente, comprobar con:

```bash
npm run build
# y mapear chunk -> ruta:
for c in $(find .next/static/chunks -name "*.js" -size +150k); do
  grep -rl "$(basename $c .js)" .next/server/app/ | grep client-reference-manifest
done
```

## Streaming

`app/(app)/loading.tsx` da el esqueleto en cada navegación. Además, los badges del
sidebar y las notificaciones del header viajan como **promesa** (`ShellSummary`) y se
resuelven dentro de su propio `Suspense`: el shell pinta sin esperar conteos de
inventario.

## Datos bajo demanda

`/inventario` traía el catálogo completo de variantes, productos, categorías y
sucursales (~235 KB de JSON, cuatro consultas) en cada carga, aunque sólo hace falta
al abrir «Agregar inventario» o al bajar la plantilla. Ahora se pide con la Server
Action `loadInventoryOptions`.

**Pendiente:** las tablas siguen enviando todas sus filas y filtrando en el
navegador. Con los volúmenes actuales es la mejor UX (filtrar no cuesta un viaje de
red), pero `/inventario` crece con catálogo × sucursales: a 5 sucursales serían
~4.300 filas / ~2,3 MB. **Umbral para pasar a paginación en servidor: ~2.000 filas o
~1 MB de payload.** La infraestructura ya existe (`lib/pagination.ts`,
`hooks/use-server-table.ts`, `components/ui/table-pagination.tsx`, como en Reportes);
lo que falta es mover a servidor los KPIs, las listas de filtros y la exportación,
que hoy se calculan sobre el conjunto completo en el cliente.

## Comprobación

Después de una carga masiva, ejecutar `ANALYZE` en `sales`, `sale_items` e
`inventory` (el runner ya lo hace). Revisar en Supabase Query Performance que las
consultas usen los índices compuestos. En Vercel, filtrar logs por
`"event":"slow_operation"`; el servidor registra automáticamente operaciones
paginadas que superen 250 ms (`lib/performance.ts`).

Mantener Vercel y Supabase en regiones cercanas: la aplicación hace varias llamadas
autenticadas y una separación regional amplifica cada recorrido.

## Protección de formularios

El componente compartido `Button` bloquea inmediatamente cualquier `submit`, además
de respetar `useFormStatus().pending`. También bloquea botones cuyo `onClick`
devuelve una promesa hasta que esta termina. Las operaciones financieras deben
conservar, además, una clave idempotente en la base de datos (paso 2 de las
migraciones).

## Verificación de sesión (causa del 504 en el POS)

**Síntoma.** `504 GATEWAY_TIMEOUT` con `Code: MIDDLEWARE_INVOCATION_TIMEOUT` al
cobrar una venta, más lentitud errática en toda la aplicación.

**Causa.** `supabase.auth.getClaims()` verifica la firma del JWT contra las claves
públicas del proyecto. Con claves asimétricas (ES256, que es lo que usamos) eso
**no** es local: supabase-js descarga `/auth/v1/.well-known/jwks.json` con un `fetch`
**sin timeout ni AbortSignal**, y lo cachea sólo 10 minutos por isolate. Cuando ese
endpoint se degradó (medido: 10,9 s en el mejor caso, sin respuesta en el resto), el
proxy se quedaba esperando hasta que la plataforma mataba la invocación. Se pagaba
dos veces por navegación: en `proxy.ts` y en `getSession()`.

Nótese que el cambio de `getUser()` a `getClaims()` fue una optimización real
(quitó ~200 ms fijos por petición), pero cambió un coste **acotado** por uno **sin
techo**. Esa es la parte que había que arreglar, no el cambio en sí.

**Arreglo** (`lib/supabase/jwks.ts`, usado por `lib/supabase/middleware.ts` y
`lib/queries/session.ts`). Cuatro capas, de más a menos deseable:

1. **Sin cookie de sesión, no se hace nada.** Un visitante anónimo no tiene token que
   verificar: ni JWKS ni `getClaims()`. Cubre `/login` y todo el tráfico no autenticado.
2. **`SUPABASE_AUTH_JWKS`**: si está en el entorno, cero red, siempre. Es la
   configuración recomendada en producción.
3. **Caché de proceso con *stale-while-revalidate*** (10 min): pasado el TTL se siguen
   sirviendo las claves viejas y el refresco va por detrás. Las claves de firma rotan
   muy de vez en cuando; si el `kid` del token no está entre ellas, supabase-js hace
   su propio viaje, acotado por `withTimeout`.
4. **Descarga acotada** con `AbortSignal.timeout` (2,5 s) y ventana de enfriamiento de
   30 s tras un fallo, para no martillear un endpoint caído.

Si aun así Auth no responde, la verificación se marca **degradada**: el proxy deja
pasar la petición en vez de expulsar al usuario (una caída de Auth no debe convertirse
en un cierre de sesión masivo). La autorización real no se relaja — la página vuelve a
comprobar la sesión y cada consulta viaja por RLS, donde Postgres verifica el JWT por
su cuenta. En ese modo degradado la sesión **no se cachea por `sub`**, porque el `sub`
de una cookie sin firma verificada podría envenenar la entrada de otro usuario.

Se distingue un `4xx` del JWKS ("el proyecto no usa claves asimétricas", y entonces
`getClaims()` debe seguir su camino y caer a `getUser()`) de una caída de red ("no
tiene sentido intentarlo").

**Medido contra el proyecto con Auth caído** (`npm run dev`, ruta protegida):

| Caso | 1.ª petición | siguientes |
|---|---|---|
| Anónimo, sin cookie | 3–90 ms | 3 ms |
| Con cookie, Auth caído | 5,1 s | ~30 ms |

Antes, ese segundo caso no terminaba: se colgaba hasta el timeout de la plataforma.

**Prefetch.** El `matcher` de `proxy.ts` excluye los prefetch del router
(`next-router-prefetch`, `purpose: prefetch`). El sidebar dispara uno por cada enlace
que roza el ratón y cada uno pagaba una verificación de sesión sin gatear nada nuevo:
un prefetch sólo calienta la caché del router, y la página que devuelve ya comprueba
la sesión por su cuenta.

## Fallos de transporte en las Server Actions

Las acciones devuelven `{ error }` para los fallos de negocio, pero si el POST muere
en el camino (red caída, 504 del proxy, despliegue a mitad) la promesa **rechaza**.
Dentro de `startTransition(async () => …)` sin `catch`, esa excepción escapa y la
transición nunca se cierra: `pending` se queda en `true` y todo lo que cuelga de
`disabled={pending}` queda muerto hasta recargar la página.

Regla: **toda** `startTransition(async …)` lleva `try`/`catch` con
`reportActionError` (`lib/action-error.ts`), que distingue el fallo de red del resto y
relanza los errores de control de flujo de Next (`redirect`, `notFound`).

En el POS, además, el `request_id` del cobro vive en un `ref` y sobrevive al fallo:
`create_sale` es idempotente por `(user_id, request_id)`, así que si la venta llegó a
grabarse y sólo se perdió la respuesta, el reintento devuelve esa misma venta en vez
de duplicarla. Se descarta al completar el cobro y al vaciar el ticket.
