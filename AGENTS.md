<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-08-08 10:54am GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,341t read) | 558,870t work | 97% savings

### Jun 22, 2026
S735 CRM SaaS — Brand settings expansion: delete logo/favicon, dark/light logo variants, fix favicon in browser tab (Jun 22 at 9:27 PM)
S736 frontend-reimpet ERP — Feature branch feat/branding-logos-favicon created (Jun 22 at 9:42 PM)
S739 ERP branding overhaul — dark/light logos, delete assets, favicon fix: spec written and branch created (Jun 22 at 9:46 PM)
S856 CRM SaaS ERP — User asked for step-by-step instructions to onboard a new client onto the ERP system (Jun 22 at 9:46 PM)
### Jul 7, 2026
S858 CRM SaaS — /nuevo-negocio skill wizard full specification confirmed (Jul 7 at 9:20 PM)
S911 CRM SaaS (WM ERP) — connect to Supabase DB using .env.local credentials and verify which project/data is present (Jul 7 at 9:40 PM)
### Jul 9, 2026
S912 CRM SaaS (WM ERP / FR Medic Group) — dev database fully wiped and invoice sequence reset to FAC-000001 (Jul 9 at 3:10 PM)
S913 CRM SaaS (WM ERP / FR Medic Group) — connect to Supabase DB via .env.local and wipe all transactional seed data for fresh start (Jul 9 at 3:13 PM)
S945 CRM SaaS — .env.local points to deleted/invalid Supabase project yxwedegszxtujplffaac (Jul 9 at 3:14 PM)
### Jul 12, 2026
S947 CRM SaaS — DNS ENOTFOUND for yxwedegszxtujplffaac.supabase.co, diagnosing stale .env.local Supabase credentials (Jul 12 at 3:48 PM)
### Aug 7, 2026
1987 7:11p 🔵 backend-reimpet WM ERP — Supabase DB schema and current data state confirmed
1988 " 🔵 backend-reimpet WM ERP — product naming convention and branch UUIDs confirmed
1989 " 🔵 backend-reimpet WM ERP — inventory Excel files structure and full Maracay dataset confirmed
1990 " 🔵 backend-reimpet WM ERP — existing DB products match Excel rows by price, confirming upsert mapping strategy
1991 " ✅ backend-reimpet WM ERP — all sales, sale_items, and expenses purged from production DB
1992 " 🔵 backend-reimpet WM ERP — DB product catalog vs Excel mismatch: 87 DB products vs 98/100 Excel rows
1993 7:18p 🟣 backend-reimpet WM ERP — inventory import script executed, upserted 198 rows across both branches
1994 7:20p ⚖️ backend-reimpet WM ERP — Maracay database cleanup and inventory reset planned
1995 7:21p 🔵 WM ERP sales reset dry-run reveals inventory import plan for two branches
1996 " 🔴 Sales reset apply fails — table public.customer_events not found in Supabase schema cache
1997 " ⚖️ backend-reimpet WM ERP — Supabase DB cleanup and inventory reset planned for Maracay and San Juan de los Morros branches
1998 7:22p ⚖️ WM ERP Maracay DB cleanup and inventory reset planned
1999 7:23p 🟣 WM ERP — Sales reset and inventory sync from Excel files applied to production Supabase DB
2000 " ⚖️ backend-reimpet WM ERP — Supabase DB cleanup and inventory reset plan for Maracay and San Juan de los Morros branches
2001 " 🟣 backend-reimpet WM ERP — sales wipe and inventory load completed for Maracay and San Juan de los Morros
2003 7:24p 🔵 backend-reimpet WM ERP — paginated inventory verification reveals higher counts than v_inventory view
2004 " 🔵 backend-reimpet WM ERP — direct psql connection to Supabase pooler fails with auth error
2005 " ✅ backend-reimpet WM ERP — maintenance script deleted after one-time use
2006 " 🔵 backend-reimpet WM ERP — repo state after maintenance: Excel files untracked, AGENTS.md modified
2007 7:40p ⚖️ frontend-reimpet — Inventory and Products modules require paginated table UI
2009 " 🔵 frontend-reimpet — Inventario and Productos modules architecture pre-pagination
2010 7:41p 🔵 frontend-reimpet — No pagination component exists anywhere in the codebase
2011 " 🟣 frontend-reimpet — TablePagination shared component created
2012 7:42p 🟣 frontend-reimpet — InventarioView refactored to paginated semantic table
2014 " 🟣 frontend-reimpet — ProductsView refactored to paginated semantic table
2015 7:43p 🟣 frontend-reimpet — Pagination feature complete: TypeScript build passes with zero errors
2016 " 🔵 frontend-reimpet — ESLint flags react-hooks/set-state-in-effect errors in pagination useEffects
2017 " 🔴 frontend-reimpet — ESLint react-hooks/set-state-in-effect errors fixed in InventarioView
2018 7:44p 🔴 frontend-reimpet — Pagination lint errors fully resolved; build and lint both pass clean
2021 7:45p 🟣 backend-reimpet WM ERP — Maintenance script to zero missing-stock inventory and remove IVA from prices
### Aug 8, 2026
2022 10:46a ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch inconsistency fix scoped
2023 " ⚖️ frontend-reimpet Ventas/Inventario/Productos — Filter and Branch Consistency Requirements Scoped
2025 10:47a ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2026 " ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2027 10:48a ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2028 " ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2029 " 🟣 frontend-reimpet Ventas — inventory fetch migrated to fetchAllRows with brand field added
2031 " 🟣 frontend-reimpet Productos — listProducts enriched with per-product sizes and colors arrays
2032 10:49a 🟣 frontend-reimpet Productos — attribute filter UI added with Categoría, Marca, Talla, Color dropdowns
2033 10:50a ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2034 " ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2035 " 🟣 frontend-reimpet Ventas POS — brand/size/color attribute filters added to pos-view
2036 10:51a 🟣 frontend-reimpet — ProductListItem type and brand field propagated across type system
2037 " 🔄 frontend-reimpet — ProductListItem type moved to database.types.ts as canonical source
2038 " 🔵 frontend-reimpet — Turbopack FATAL panic on npm run build (OS port-binding permission error)
2039 10:53a 🟣 frontend-reimpet Ventas/Inventario/Productos — attribute filters and branch-visibility fix scoped
2040 " ⚖️ frontend-reimpet Ventas/Inventario/Productos — filter and branch-visibility bug scope defined
2041 " 🟣 frontend-reimpet — talla/color/marca/categoría filters added to Ventas, Inventario, and Productos modules
2042 " 🔴 frontend-reimpet Inventario "Todas las sucursales" — missing products fixed by switching to paginated fetchAllRows()
2043 10:54a ✅ frontend-reimpet — filter + pagination changes pass TypeScript check and production build cleanly

Access 559k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>