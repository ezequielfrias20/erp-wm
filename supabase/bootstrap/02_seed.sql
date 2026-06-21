-- =============================================================================
--  ERP — SEED MÍNIMO ("esqueleto operativo"). Solo lo necesario para operar:
--  roles + matriz de permisos, métodos de pago, 1 sucursal y la fila settings.
--  SIN catálogo (tallas/colores/categorías/marcas) ni datos de negocio.
--  Idempotente: re-correrlo no duplica.
--
--  Parámetro:  -v company_name='Nombre del Negocio'   (default: 'Mi Negocio')
--  Correr con:  psql "$CONN" -v ON_ERROR_STOP=1 -v company_name='ACME' -f 02_seed.sql
-- =============================================================================

-- Default si no se pasa -v company_name
\if :{?company_name}
\else
  \set company_name 'Mi Negocio'
\endif

-- ===== Roles =================================================================
insert into wm.roles (name, sort_order) values
  ('Super Admin', 1),
  ('Administrador', 2),
  ('Gerente', 3),
  ('Vendedor', 4),
  ('Inventario', 5),
  ('Cajero', 6)
on conflict (name) do update set sort_order = excluded.sort_order;

-- ===== Matriz de permisos (rol × módulo) ====================================
-- level: 0 sin acceso · 1 ver · 2 total
-- módulos: Dashboard, Ventas, Inventario, Productos, Clientes, Sucursales,
--          Usuarios, Reportes, Configuración
insert into wm.role_permissions (role, module, level) values
  -- Super Admin: acceso total
  ('Super Admin','Dashboard',2),('Super Admin','Ventas',2),('Super Admin','Inventario',2),
  ('Super Admin','Productos',2),('Super Admin','Clientes',2),('Super Admin','Sucursales',2),
  ('Super Admin','Usuarios',2),('Super Admin','Reportes',2),('Super Admin','Configuración',2),
  -- Administrador: total salvo Configuración (solo ver)
  ('Administrador','Dashboard',2),('Administrador','Ventas',2),('Administrador','Inventario',2),
  ('Administrador','Productos',2),('Administrador','Clientes',2),('Administrador','Sucursales',2),
  ('Administrador','Usuarios',2),('Administrador','Reportes',2),('Administrador','Configuración',1),
  -- Gerente
  ('Gerente','Dashboard',2),('Gerente','Ventas',2),('Gerente','Inventario',2),
  ('Gerente','Productos',2),('Gerente','Clientes',2),('Gerente','Sucursales',1),
  ('Gerente','Usuarios',1),('Gerente','Reportes',2),('Gerente','Configuración',0),
  -- Vendedor
  ('Vendedor','Dashboard',1),('Vendedor','Ventas',2),('Vendedor','Inventario',1),
  ('Vendedor','Productos',1),('Vendedor','Clientes',2),('Vendedor','Sucursales',0),
  ('Vendedor','Usuarios',0),('Vendedor','Reportes',0),('Vendedor','Configuración',0),
  -- Inventario
  ('Inventario','Dashboard',1),('Inventario','Ventas',1),('Inventario','Inventario',2),
  ('Inventario','Productos',2),('Inventario','Clientes',1),('Inventario','Sucursales',0),
  ('Inventario','Usuarios',0),('Inventario','Reportes',1),('Inventario','Configuración',0),
  -- Cajero
  ('Cajero','Dashboard',1),('Cajero','Ventas',2),('Cajero','Inventario',0),
  ('Cajero','Productos',0),('Cajero','Clientes',1),('Cajero','Sucursales',0),
  ('Cajero','Usuarios',0),('Cajero','Reportes',0),('Cajero','Configuración',0)
on conflict (role, module) do update set level = excluded.level;

-- ===== Métodos de pago ======================================================
-- VES: efectivo Bs, Pago Móvil, Transferencia, tarjetas. USD: efectivo $, Zelle, Binance.
-- Cashea: meta-método financiado (cuenta por cobrar). Mixto: meta-método (modal).
insert into wm.payment_methods (name, enabled, sort_order, currency, requires_reference, is_financed) values
  ('Efectivo USD',   true,  1, 'USD', false, false),
  ('Efectivo VES',   true,  2, 'VES', false, false),
  ('Pago Móvil',     true,  3, 'VES', true,  false),
  ('Transferencia',  true,  4, 'VES', true,  false),
  ('Tarjeta débito', true,  5, 'VES', false, false),
  ('Tarjeta crédito',true,  6, 'VES', false, false),
  ('Zelle',          true,  7, 'USD', true,  false),
  ('Binance',        true,  8, 'USD', true,  false),
  ('Cashea',         true, 98, 'USD', true,  true),
  ('Mixto',          true, 99, 'VES', false, false)
on conflict (name) do update set
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  currency = excluded.currency,
  requires_reference = excluded.requires_reference,
  is_financed = excluded.is_financed;

-- ===== Sucursal por defecto =================================================
-- El owner la renombra/edita (ciudad, dirección, meta) desde Sucursales.
insert into wm.branches (code, city, name, is_active) values
  ('S01', 'Principal', 'Principal', true)
on conflict (code) do nothing;

-- ===== Configuración (fila singleton id=1) ==================================
insert into wm.settings (id, company_name) values
  (1, :'company_name')
on conflict (id) do update set company_name = excluded.company_name;

-- Resumen
do $$
begin
  raise notice 'Seed OK · roles=% · permisos=% · métodos_pago=% · sucursales=%',
    (select count(*) from wm.roles),
    (select count(*) from wm.role_permissions),
    (select count(*) from wm.payment_methods),
    (select count(*) from wm.branches);
end$$;
