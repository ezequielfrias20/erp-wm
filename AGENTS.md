<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-07-09 4:36pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,030t read) | 537,699t work | 96% savings

### Jun 21, 2026
S727 CRM SaaS — Logo display fix planned for login and sidebar (Jun 21 at 7:40 PM)
### Jun 22, 2026
S731 CRM SaaS — Delete logo/favicon: UI patterns and component conventions confirmed (Jun 22 at 8:51 PM)
S735 CRM SaaS — Brand settings expansion: delete logo/favicon, dark/light logo variants, fix favicon in browser tab (Jun 22 at 9:27 PM)
S736 frontend-reimpet ERP — Feature branch feat/branding-logos-favicon created (Jun 22 at 9:42 PM)
S739 ERP branding overhaul — dark/light logos, delete assets, favicon fix: spec written and branch created (Jun 22 at 9:46 PM)
S856 CRM SaaS ERP — User asked for step-by-step instructions to onboard a new client onto the ERP system (Jun 22 at 9:46 PM)
### Jul 3, 2026
1322 4:39p 🔵 CRM SaaS — proxy.ts matcher excludes favicon.ico but not favicon-default.ico, causing Supabase DNS calls for static asset requests
1323 4:40p 🔵 CRM SaaS — Supabase DNS resolution failure in development environment
1324 " 🔵 CRM SaaS — Supabase DNS resolution failure (ENOTFOUND) in local dev environment
1325 4:44p 🔵 CRM SaaS ERP — Supabase project URL not resolvable via DNS
### Jul 7, 2026
1388 9:19p 🔵 CRM SaaS ERP — New Business Onboarding Process Documented
S858 CRM SaaS — /nuevo-negocio skill wizard full specification confirmed (Jul 7 at 9:20 PM)
1389 9:40p 🔵 CRM SaaS — /nuevo-negocio skill wizard full specification confirmed
1390 " 🔵 CRM SaaS — Supabase organization ID for WM Plataforma confirmed
1391 " 🟣 CRM SaaS — New Supabase project created for client "Reyes Magos"
1392 " 🟣 CRM SaaS — wm-reyesmagos bootstrap scripts all ran successfully
1393 " 🟣 CRM SaaS — wm-reyesmagos .env.local created with Supabase credentials
S911 CRM SaaS (WM ERP) — connect to Supabase DB using .env.local credentials and verify which project/data is present (Jul 7 at 9:40 PM)
1394 9:48p ⚖️ CRM SaaS — New client "Cubo Labs" onboarding initiated
1397 9:59p 🔵 CRM SaaS — Cubo Labs Supabase project blocks direct psql TCP connections
1398 10:00p 🔵 CRM SaaS — crm_cubo_labs Supabase project already bootstrapped for wrong client
1399 10:01p 🔵 CRM SaaS — crm_cubo_labs project contains live World Medics production data
1400 10:02p 🔵 CRM SaaS — Supabase project kvypcrwmesqrfmowghms is clean (no wm schema)
1401 10:04p 🔵 CRM SaaS — Bootstrap SQL files confirmed at supabase/bootstrap/ with sizes
1402 10:05p 🔵 CRM SaaS bootstrap — 01_schema.sql confirmed as pure SQL with no psql meta-commands
1403 " 🔵 CRM SaaS — 01_schema.sql contains PostgREST reload, storage bucket, and role grants that may fail via MCP
1404 " 🔵 CRM SaaS — New Supabase project creation confirmed at $0/month on free tier
1405 10:08p 🔵 CRM SaaS — kvypcrwmesqrfmowghms pre-flight: owner email already exists in auth.users
1406 10:11p 🔵 CRM SaaS — Supabase network connectivity: direct DB unreachable, pooler ports open
1407 10:20p 🔵 CRM SaaS — Cubo Labs bootstrap credentials confirmed
1408 10:21p 🔵 CRM SaaS — Supabase pooler connection fails for Cubo Labs project
### Jul 8, 2026
1410 7:28a 🔵 CRM SaaS — Supabase environment variables required for Vercel deployment
### Jul 9, 2026
1473 2:57p 🔵 CRM SaaS — Vercel/Supabase prod data not visible on localhost
1474 2:58p 🔵 CRM SaaS — Sales made via Vercel+Supabase not visible on localhost
1475 " 🔵 CRM SaaS ERP — localhost .env.local points to production Supabase project cfggippjujceebovvhsa
1476 2:59p 🔵 CRM SaaS ERP — .env.local points to Supabase project NOT in user's account
1477 " 🔵 CRM SaaS ERP — wm.sales most recent record is FAC-008473 from June 21, 2026; July sale missing
1478 " 🔵 CRM SaaS ERP — wm.products has 14 records in project yxwedegszxtujplffaac
1479 " 🔵 CRM SaaS ERP — Sale made via Vercel not visible on localhost; local sale creation also failing
1480 3:00p 🔵 CRM SaaS ERP (WM) — sale made via Vercel not visible on localhost; sale creation failing locally
1481 " 🔵 CRM SaaS ERP (WM) — sale created on Vercel not visible on localhost; local sale creation also failing
1482 3:01p 🔵 CRM SaaS ERP (WM) — sale made via Vercel not visible on localhost; local sale creation also failing
1484 3:09p 🔵 frontend-reimpet ERP — SUPABASE_DB_URL contains HTML-encoded `&gt;` breaking psql connections
1483 " 🔵 CRM SaaS — two Supabase projects confirmed, psql connection to cfggippjujceebovvhsa verified
1485 3:10p 🔵 CRM SaaS (WM ERP) — cfggippjujceebovvhsa is a near-empty database, not the production WM database
S912 CRM SaaS (WM ERP / FR Medic Group) — dev database fully wiped and invoice sequence reset to FAC-000001 (Jul 9 at 3:10 PM)
1486 " 🔵 frontend-reimpet ERP — psql cannot resolve Supabase pooler hostname (DNS failure)
1487 " 🔵 frontend-reimpet ERP — psql successfully connected to Supabase project cfggippjujceebovvhsa
1488 3:12p 🔵 CRM SaaS (WM ERP / FR Medic Group) — wm schema differences from expected: size_id→size, no product_name in sale_items
1489 3:13p 🔵 CRM SaaS (WM ERP / FR Medic Group) — products/variants/inventory wiped from dev DB; SET NULL FK behavior confirmed on sale_items
1490 " ✅ CRM SaaS (WM ERP / FR Medic Group) — dev database fully wiped and invoice sequence reset to FAC-000001
S913 CRM SaaS (WM ERP / FR Medic Group) — connect to Supabase DB via .env.local and wipe all transactional seed data for fresh start (Jul 9 at 3:14 PM)
1491 3:48p ⚖️ CRM SaaS (WM ERP) — bulk product and inventory import from Excel planned for both branches
1492 3:49p ⚖️ CRM SaaS (WM ERP) — Bulk product + inventory import from Excel into Supabase planned
1493 3:50p ⚖️ CRM SaaS (WM ERP) — Bulk product and inventory import from Excel into Supabase planned
1494 " ⚖️ CRM SaaS (WM ERP) — Bulk product + inventory seeding from Excel requested for two branches
1495 3:51p ⚖️ CRM SaaS (WM ERP) — Product and inventory bulk import from Excel planned
1496 " ⚖️ WM ERP — bulk product and inventory seeding from Excel files planned
1497 3:52p ⚖️ CRM SaaS (WM ERP) — Bulk product/inventory import from Excel into Supabase planned
1498 3:53p ⚖️ WM ERP — Bulk product and inventory import from Excel planned for two branches

Access 538k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>