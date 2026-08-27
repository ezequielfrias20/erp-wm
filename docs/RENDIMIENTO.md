# Rendimiento en producción

## Migraciones

Aplicar en este orden, fuera de una transacción porque los índices se crean con
`CONCURRENTLY`:

1. `supabase/performance_indexes.sql`
2. `supabase/create_sale_tax_included.sql`

El segundo paso activa la idempotencia de ventas. Cada intento de cobro lleva un
UUID y PostgreSQL toma un advisory lock por usuario/UUID antes de insertar. Si la
misma petición llega dos veces, devuelve la venta original sin volver a descontar
inventario.

## Comprobación

Después de una carga masiva, ejecutar `ANALYZE` en `sales`, `sale_items` e
`inventory`. Revisar en Supabase Query Performance que las consultas usen los
índices compuestos. En Vercel, filtrar logs por `"event":"slow_operation"`; el
servidor registra automáticamente operaciones paginadas que superen 250 ms.

Mantener Vercel y Supabase en regiones geográficamente cercanas. La aplicación
realiza varias llamadas autenticadas y una separación regional amplifica cada
recorrido de red.

## Protección de formularios

El componente compartido `Button` bloquea inmediatamente cualquier `submit`,
además de respetar `useFormStatus().pending`. También bloquea botones cuyo
`onClick` devuelve una promesa hasta que esta termina. Las operaciones financieras
deben conservar, además, una clave idempotente en la base de datos.
