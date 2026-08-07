<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-08-07 7:45pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,824t read) | 683,877t work | 97% savings

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
### Aug 5, 2026
1946 7:27p 🟣 frontend-reimpet Proyectos — saveRegistration wired with reference deduplication and ticket issuance on status change
1947 " 🟣 frontend-reimpet Proyectos — ticket status column and QR link added to registration table UI
1948 7:28p ✅ backend-reimpet Proyectos — ticket_hash column-level UNIQUE constraint removed in favor of partial index only
1949 " 🔵 frontend-reimpet Proyectos — TypeScript compilation passes clean after QR ticket feature implementation
1950 " 🔵 backend-reimpet Proyectos — live Supabase DB verified: all 8 ticket columns and both unique indexes confirmed present
1951 7:29p 🔵 frontend-reimpet + backend-reimpet Proyectos — full uncommitted git state captured before commit
### Aug 6, 2026
1953 10:17a ⚖️ frontend-reimpet Proyectos — checkout form fields Universidad/Institución and Perfil to be removed
1954 " 🔵 conferences checkout — "Universidad o institución" and "Perfil" fields located across three files
1955 " 🔵 conferences checkout — complete field-removal scope confirmed across 6 files
1956 10:18a 🔵 backend-reimpet conferences — full perfil/institucion removal scope includes ERP lib and route
1957 " ⚖️ frontend-reimpet Proyectos — Remove Universidad/Institución and Perfil fields from conference checkout
1958 10:19a ⚖️ frontend-reimpet Proyectos — Remove Universidad/Institución and Perfil fields from conference checkout form
1959 " ⚖️ frontend-reimpet Proyectos — Remove Universidad/Institución and Perfil fields from conference checkout form
1960 10:35a 🔵 conferences + erp — Field removal scope clarified by reading current file state
1961 " 🔵 conferences + erp — Full integration architecture mapped for conference registration
1962 10:41a 🔵 backend-reimpet Proyectos — CONFERENCES_PROJECT_ID retrieval via Supabase REST API failed locally
1963 10:42a 🔵 backend-reimpet Proyectos — CONFERENCES_PROJECT_ID retrieval method: psql via SUPABASE_DB_URL
1964 " 🔵 backend-reimpet Proyectos — SUPABASE_DB_URL password has unencoded special chars, breaking psql URI parsing
1965 " 🔵 backend-reimpet Proyectos — CONFERENCES_PROJECT_ID not stored in codebase; must be fetched from Supabase dashboard
1966 " 🔵 frontend-reimpet + backend-reimpet Proyectos — conferences project is "10.ª CIM" with CIM10 order code prefix, no UUID in frontend repo
1967 10:48a 🔵 backend-reimpet Proyectos — CONFERENCES_PROJECT_ID retrieved: 7ef7b37a-760a-4a5c-86d7-0d28dd32d77c
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

Access 684k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>