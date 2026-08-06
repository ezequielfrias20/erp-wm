<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-08-06 7:15pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,127t read) | 849,731t work | 98% savings

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
### Jul 15, 2026
1642 4:35p 🔴 Thermal Invoice Print Height Now Dynamic via DOM Measurement
1643 " 🔴 Removed estimateThermalInvoiceHeight Heuristic from POS View
1644 4:36p 🟣 ThermalInvoiceDocument Component Added to invoice-template.tsx
### Aug 5, 2026
1915 6:11p 🟣 frontend-reimpet + backend-reimpet Proyectos — full-stack Projects module implemented and deployed to Supabase
1917 6:56p 🟣 frontend-reimpet + backend-reimpet Proyectos — project_registrations schema extended with multi-currency payment fields
1918 6:57p ✅ backend-reimpet Proyectos — idempotent currency migration file created for live Supabase alter
1919 " 🟣 frontend-reimpet Proyectos — actions.ts and page.tsx updated with full currency/rate payment logic
1920 " 🟣 frontend-reimpet Proyectos — ProyectosView updated with currency-aware payment display and exchange rate/date form fields
1921 " 🔴 frontend-reimpet Proyectos — apply_patch for proyectos-view.tsx failed; write_file succeeded but patch verification failed
1922 6:58p 🔴 frontend-reimpet Proyectos — proyectos-view.tsx currency UI patches applied successfully via split patches
1923 " 🟣 frontend-reimpet Proyectos — RegistrationForm fully wired with currency fields; table grid widened for amount column
1924 " ✅ frontend-reimpet Proyectos — TypeScript and ESLint pass clean; Proyectos module changes ready to commit
1925 6:59p 🔴 backend-reimpet Proyectos — migration project_payments_currency_rate failed: rate_chk violated by existing VES rows with null exchange_rate
1927 " 🔵 backend-reimpet Proyectos — confirmed currency/amount columns do NOT yet exist on live wm.project_registrations
1928 " 🔵 backend-reimpet Proyectos — live DB has 2 test registrations; BCV rate is 755.1552 on 2026-08-05
1929 7:00p 🔴 backend-reimpet Proyectos — migration fixed with defensive VES backfill for exchange_rate and amount before adding rate_chk constraint
1930 " 🟣 backend-reimpet Proyectos — migration project_payments_currency_rate applied successfully to Supabase
1931 " 🔵 backend-reimpet Proyectos — live data verified: Pago móvil row correctly backfilled, Binance USD row has null exchange_rate (expected)
1932 " ✅ frontend-reimpet + backend-reimpet Proyectos — all changes staged for commit; TypeScript and ESLint clean
1933 7:22p ⚖️ frontend-reimpet + backend-reimpet Proyectos — QR ticket + Resend email architecture planned
1935 7:24p ✅ frontend-reimpet Proyectos — qrcode npm package installed for QR ticket generation
1937 " 🔵 frontend-reimpet Proyectos — actions.ts current structure before QR/Resend implementation
1938 7:25p 🟣 frontend-reimpet Proyectos — ticket fields and ProjectTicketStatus type added to database.types.ts
1940 " 🟣 backend-reimpet Proyectos — ticket columns and unique reference index added to 01_schema.sql
1941 " 🟣 backend-reimpet Proyectos — projects_module.sql live migration updated with ticket columns, constraints, and indexes
1942 7:26p 🟣 backend-reimpet Proyectos — standalone migration file projects_tickets_resend.sql created for live Supabase apply
1943 " 🔵 backend-reimpet Proyectos — live DB has zero duplicate payment_reference values, safe to add unique index
1944 " 🟣 backend-reimpet Proyectos — project_tickets_resend migration successfully deployed to live Supabase
1945 7:27p 🟣 frontend-reimpet Proyectos — QR ticket generation and Resend email logic implemented in actions.ts
1946 " 🟣 frontend-reimpet Proyectos — saveRegistration wired with reference deduplication and ticket issuance on status change
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

Access 850k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>