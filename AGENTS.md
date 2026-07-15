<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-07-15 4:34pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,411t read) | 416,177t work | 96% savings

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
1490 3:13p ✅ CRM SaaS (WM ERP / FR Medic Group) — dev database fully wiped and invoice sequence reset to FAC-000001
S913 CRM SaaS (WM ERP / FR Medic Group) — connect to Supabase DB via .env.local and wipe all transactional seed data for fresh start (Jul 9 at 3:13 PM)
S945 CRM SaaS — .env.local points to deleted/invalid Supabase project yxwedegszxtujplffaac (Jul 9 at 3:14 PM)
1491 3:48p ⚖️ CRM SaaS (WM ERP) — bulk product and inventory import from Excel planned for both branches
1492 3:49p ⚖️ CRM SaaS (WM ERP) — Bulk product + inventory import from Excel into Supabase planned
1493 3:50p ⚖️ CRM SaaS (WM ERP) — Bulk product and inventory import from Excel into Supabase planned
1494 " ⚖️ CRM SaaS (WM ERP) — Bulk product + inventory seeding from Excel requested for two branches
1495 3:51p ⚖️ CRM SaaS (WM ERP) — Product and inventory bulk import from Excel planned
1496 " ⚖️ WM ERP — bulk product and inventory seeding from Excel files planned
1497 3:52p ⚖️ CRM SaaS (WM ERP) — Bulk product/inventory import from Excel into Supabase planned
1498 3:53p ⚖️ WM ERP — Bulk product and inventory import from Excel planned for two branches
1528 4:40p 🟣 CRM SaaS Ventas — product cards must show color, size, and full name
### Jul 12, 2026
1518 3:36p ⚖️ CRM SaaS — Cubo Labs new project bootstrap initiated from .env.local context
1519 3:37p 🔴 CRM SaaS bootstrap — 03_owner.sql auth.users INSERT patched with missing required columns
1529 3:45p 🔴 CRM SaaS Ventas POS — product name no longer truncates on sale cards
1535 3:48p 🔵 CRM SaaS — .env.local points to deleted/invalid Supabase project yxwedegszxtujplffaac
S947 CRM SaaS — DNS ENOTFOUND for yxwedegszxtujplffaac.supabase.co, diagnosing stale .env.local Supabase credentials (Jul 12 at 3:48 PM)
### Jul 14, 2026
1601 9:54a 🔵 CRM SaaS — new Supabase database bootstrap initiated
1602 " 🔵 frontend-reimpet ERP — bootstrap SQL system structure confirmed
1603 9:55a 🔵 frontend-reimpet ERP — new Supabase project bootstrap via MCP forced by missing DB URL
1604 " 🔵 frontend-reimpet ERP — .env.local bootstrap template vars commented out, awaiting new project credentials
1605 9:58a ⚖️ New Supabase project bootstrap — MCP execute_sql path confirmed for crm_cubo_labs
1606 10:00a 🔵 backend-reimpet bootstrap — 04_demo_data.sql structure mapped: 3 sucursales, 5 staff, 7 facturas, Cashea records
1607 10:01a 🔄 04_demo_data.sql — hardcoded branch UUIDs replaced with dynamic subqueries
1608 10:02a ⚖️ crm_cubo_labs bootstrap — MCP-only migration + seed data + Super Admin requested
1609 " ⚖️ New Supabase project bootstrap — MCP-only path for crm_cubo_labs
1610 10:03a 🔵 crm_cubo_labs bootstrap — .env.local confirmed dual-project structure with active Cubo Labs credentials
1611 " 🟣 crm_cubo_labs bootstrap — 04_demo_data.sql created and validated as MCP-safe
### Jul 15, 2026
1614 4:10p 🟣 80mm Thermal Receipt Invoice Print Format Requested
1615 " 🔵 ERP Project Structure: Next.js POS System with Supabase Backend
1616 " 🔵 Existing Invoice Template: Wide-Format HTML (720px) with Inline Styles
1617 " 🔵 Invoice Print Flow: InvoiceDocument Used in POS and Reportes via printNode iframe
1618 4:11p 🔵 InvoiceModal Scaling Logic and SaleCompleted Flow in POS
1619 4:12p 🟣 ThermalInvoiceDocument Component Added for 80mm Thermal Printer
1620 " 🟣 POS InvoiceModal Switched to ThermalInvoiceDocument at 302px Preview Width
1621 " 🔄 Unused InvoiceDocument Import Removed from pos-view.tsx
1622 4:13p 🟣 Reportes SaleDetailModal Also Switched to ThermalInvoiceDocument
1623 " 🔵 Pre-existing Lint Errors in ERP Codebase (Unrelated to Thermal Invoice)
1624 " 🔵 Thermal Invoice Files Pass TypeScript and ESLint Checks Clean
1625 4:14p 🟣 80mm Thermal Receipt Feature Complete — Full Changeset Confirmed
1626 " 🔴 Thermal Print Page Size Fixed: auto → 1000mm Height to Prevent Page Breaks
1627 " 🟣 80mm Thermal Receipt Feature Finalized, Validated, and Staged for Commit
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

Access 416k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>