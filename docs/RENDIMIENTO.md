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
