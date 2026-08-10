<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-08-10 2:29pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,605t read) | 552,516t work | 96% savings

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
### Aug 8, 2026
2047 11:21a 🔵 frontend-reimpet BCV rate — full call graph and lib/bcv.ts structure discovered
2049 11:22a 🟣 frontend-reimpet BCV rate — dual-endpoint fetch with most-recent-date reconciliation implemented
2050 " 🟣 frontend-reimpet BCV rate — vitest unit tests added for resolveBcvRate()
2051 " ✅ frontend-reimpet BCV rate — all 5 vitest tests pass for resolveBcvRate()
2052 11:23a 🔴 frontend-reimpet BCV rate — TypeScript TS2353 error fixed by adding fuente field to response types
2054 11:24a ✅ frontend-reimpet BCV rate — tsc clean (0 errors) and full test suite 25/25 passing
2055 " ✅ frontend-reimpet BCV rate — Next.js production build passes cleanly after dual-endpoint implementation
2057 11:25a ✅ frontend-reimpet BCV rate — uncommitted changeset ready for commit
2058 " ✅ frontend-reimpet BCV rate — fetchJson() hardened with try/catch and Array.isArray guard
2060 " 🟣 frontend-reimpet BCV rate — live endpoint verified returning historical rate as most recent
2061 11:44a ⚖️ frontend-reimpet VES pricing — 4-decimal precision recommended to reduce bolivar rounding error
2063 " 🔵 frontend-reimpet ERP — sale price precision is numeric(12,2) throughout DB and RPC
2064 11:45a 🔵 frontend-reimpet ERP — full USD→VES precision chain traced through POS and invoice code
2065 5:12p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2066 5:13p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2067 5:14p ⚖️ frontend-reimpet + backend-reimpet — Vendedores commission system architecture planned
2068 " ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission system architecture planned
2069 5:15p 🔵 backend-reimpet — Schema patch for vendedor commission system failed; current schema state confirmed
2071 " 🟣 backend-reimpet — Vendedor commission system schema implemented in 01_schema.sql
2072 5:16p 🟣 backend-reimpet — create_sale_tax_included.sql patched with vendedor seller validation
2073 " ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2074 5:17p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2075 " ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2076 5:18p 🟣 backend-reimpet — system_access=true guard added to all auth SQL functions and session query
2078 " 🟣 backend-reimpet — acceptInvite action hardened to block vendedor profiles from completing auth invite flow
2079 " 🟣 frontend-reimpet — Ventas page server component fetches active Vendedor sellers and passes them to PosView
2080 " 🟣 frontend-reimpet — PosView vendedor selector and employee code input wired into checkout flow
2081 5:19p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2082 5:20p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2083 " ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system: requirements re-confirmed by client
2084 5:21p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2085 5:22p ⚖️ frontend-reimpet + backend-reimpet — Vendedor commission tracking system architecture planned
2087 " 🔵 frontend-reimpet Usuarios — ESLint error: setState called synchronously inside useEffect in usuarios-view.tsx
2088 " 🔴 frontend-reimpet Usuarios — ESLint react-hooks/set-state-in-effect error fixed in usuarios-view.tsx
2089 5:23p ✅ frontend-reimpet — TypeScript and ESLint both pass clean after usuarios-view.tsx fix
2091 " 🔵 frontend-reimpet — Turbopack FATAL panic during production build: "binding to a port - Operation not permitted (os error 1)"
2092 5:24p 🔵 frontend-reimpet — Production build passes clean with 18 routes including new /usuarios and /ventas with vendedor support
2093 " 🟣 frontend-reimpet + backend-reimpet — Vendedor commission system fully implemented across 16 files
2095 5:25p 🔵 frontend-reimpet — Dev server already running at localhost:3000 (PID 44250) before commission system changes
2096 " 🔴 frontend-reimpet — app/(auth)/actions.ts: duplicate `profile` variable causes Turbopack runtime error after hot-reload
2097 5:26p 🔵 frontend-reimpet — Dev server confirmed live at localhost:3000; /ventas auth guard redirects unauthenticated requests correctly
2099 " 🟣 backend-reimpet — supabase/sales_commissions.sql: full DB migration for vendedor commission system
2100 5:31p 🔵 frontend-reimpet Login — Blank Screen Bug Reported
2102 5:32p 🔵 frontend-reimpet Login — Blank Screen Root Causes Identified from Logs
2103 " 🔵 frontend-reimpet — lib/queries/session.ts Blocks Vendedor Login via system_access Guard
2104 5:33p 🔴 frontend-reimpet Middleware — Stale Refresh Token Now Clears Auth Cookies Instead of Looping
2105 5:36p 🔴 frontend-reimpet — Production Build Passes Clean After Middleware Auth Fix
2106 5:37p 🔵 frontend-reimpet — Full Route Inventory Confirmed in Production Build
2107 " 🔴 frontend-reimpet — session.ts system_access Guard Uses Strict Equality to Avoid Null Coercion Bug
### Aug 10, 2026
2150 11:39a ⚖️ frontend-reimpet Ventas/Inventario/Productos — add attribute filters and fix "Todas las sucursales" product visibility bug

Access 553k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>