# Progreso de implementación — World Medics ERP

Estado por fase. Actualizar al cerrar cada módulo. Leyenda: ✅ hecho · 🚧 en curso · ⬜ pendiente.

| # | Fase / Módulo | Estado | Notas |
|---|---|---|---|
| 0 | Scaffold (Next 16, Tailwind v4, shadcn, tokens, providers, BCV, format) | ✅ | Tokens del handoff en `globals.css`; Inter; sonner; next-themes |
| 1 | Supabase: esquema `wm`, tablas, RLS, grants, seed, admin, tipos | ✅ | Login validado end-to-end; advisor sin errores (solo WARN) |
| 2 | Auth (login, aceptar invitación, middleware, contexto sesión/rol) | ⬜ | |
| 3 | Shell (sidebar, header, tema, sucursal global, BCV, notif, perfil) | ⬜ | |
| 4 | Sucursales (CRUD + mapa + ranking + detalle) | ⬜ | |
| 5 | Productos (lista + detalle/editor con variantes) | ⬜ | |
| 6 | Inventario (tabla stock, KPIs, filtros, editar) | ⬜ | |
| 7 | Clientes (lista + detalle + timeline + CRUD) | ⬜ | |
| 8 | Ventas / POS (carrito, cobro, descuento de inventario) | ⬜ | |
| 9 | Dashboard (KPIs, gráficos, listas, filtrado por sucursal) | ⬜ | |
| 10 | Usuarios y permisos (lista, invitar, matriz de permisos) | ⬜ | |
| 11 | Reportes (filtros, gráficos, tabla detalle, exportar) | ⬜ | |
| 12 | Configuración (perfil, empresa, marca, apariencia, ventas, inventario, notif, auditoría) | ⬜ | |

## Cómo reanudar
1. Leer `CLAUDE.md` (stack, Supabase, RLS, credenciales, convenciones).
2. Revisar la última fila ✅/🚧 de esta tabla y continuar por la siguiente ⬜.
3. `npm run dev` y entrar con `pedro.salas@worldmedics.ve` / `WorldMedics.2026`.
4. La base de datos `wm` ya está creada y sembrada; no hace falta recrearla.

## Decisiones clave
- Solo invitación (sin registro público). Primer admin = Pedro Salas (Super Admin).
- Esquema `wm` aislado dentro del proyecto Supabase `crm_cubo_labs`.
- Tasa BCV en vivo desde dolarapi (`/v1/dolares/oficial`, campo `promedio`).
- Filtro global por sucursal en todo el sistema.
