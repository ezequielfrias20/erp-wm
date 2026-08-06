<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-08-06 9:31am GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,075t read) | 670,854t work | 97% savings

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
1627 4:14p 🟣 80mm Thermal Receipt Feature Finalized, Validated, and Staged for Commit
1628 " 🟣 Thermal Receipt Feature Committed to main — 331 Lines, 3 Files
1629 4:15p 🔵 Dev Server Fails on Port 3000 — EPERM: Operation Not Permitted
1630 " 🔵 Dev Server Already Running on Port 3000 (PID 71396) — App Live at localhost:3000
1631 " 🟣 Thermal 80mm Invoice Template Added to ERP POS and Reports
1632 " 🔵 Dev Server Hot-Reloaded Thermal Invoice Changes; Pre-existing Hydration Error on /dashboard
1633 " 🔴 InvoiceModal Preview Container Fixed: items-center/overflow-hidden → items-start/overflow-auto
1634 4:16p 🟣 80mm Thermal Receipt Implementation — Final State Verified Across All Files
1635 " ✅ PROGRESS.md Updated with Thermal Receipt Feature Documentation
1636 4:17p 🟣 POS InvoiceModal Gains Dual-Format Print: A4 Preview + Hidden Thermal for "Ticket 80 mm" Button
1637 " 🟣 Reportes SaleDetailModal Also Gets Dual-Format Print: A4 Preview + "Ticket 80 mm" Button
1638 " 🟣 Dual-Format Invoice Print Committed — Final Architecture Verified on main
1639 4:34p 🔴 Invoice Height Fixed to Dynamic Instead of Static
1640 " 🔵 Invoice Template Print Mechanism Uses iframe Isolation
1641 4:35p 🔵 Invoice Preview Uses estimatedHeight for Scaling Container
1642 " 🔴 Thermal Invoice Print Height Now Dynamic via DOM Measurement
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

Access 671k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>