<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-07-08 7:28am GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,782t read) | 548,994t work | 97% savings

### Jun 21, 2026
S708 CRM SaaS — White-label branding propagation fully specified (Jun 21 at 10:57 AM)
S709 CRM SaaS — White-label branding system: design spec written for logo, favicon, and primary color propagation (Jun 21 at 7:27 PM)
S715 CRM SaaS — Branding dinámico: spec approved, implementation plan written and committed (Jun 21 at 7:30 PM)
S727 CRM SaaS — Logo display fix planned for login and sidebar (Jun 21 at 7:40 PM)
1114 7:44p 🟣 CRM SaaS ERP — Vitest runner committed to main branch
1115 " 🟣 CRM SaaS ERP — TDD tests written for lib/brand-css.ts colour helpers
### Jun 22, 2026
1144 8:41p ⚖️ CRM SaaS — Logo sizing fix planned for login and sidebar
1145 " ⚖️ CRM SaaS — Logo display fix planned for login and sidebar
1146 " ⚖️ CRM SaaS — Logo display fix planned for login and sidebar
1147 8:42p ⚖️ CRM SaaS — Logo display fix planned for login and sidebar menu
1148 " ⚖️ CRM SaaS — Logo display fix planned for login and sidebar
1149 " ⚖️ CRM SaaS — Logo display fix planned for login and sidebar menu
1150 " 🔵 CRM SaaS ERP — ESLint audit reveals 4 errors across 3 components
1152 8:51p ⚖️ CRM SaaS — Logo display fix planned for login and sidebar
S731 CRM SaaS — Delete logo/favicon: UI patterns and component conventions confirmed (Jun 22 at 8:51 PM)
1153 8:52p ⚖️ CRM SaaS — Logo size increase requested within fixed container bounds
1154 " ✅ CRM SaaS — Logo visually enlarged via CSS scale without changing container dimensions
1155 " ✅ CRM SaaS — brand-mark.tsx logo scale fix confirmed clean and applied
1156 9:25p ⚖️ CRM SaaS — Logo and favicon delete capability planned
1157 9:26p 🔵 CRM SaaS — Branding asset deletion feature: existing code structure explored
1158 " 🔵 CRM SaaS — Brand asset actions structure explored for delete logo/favicon feature
1159 " 🔵 CRM SaaS — Delete logo/favicon: full codebase context mapped for implementation
1160 9:27p 🔵 CRM SaaS — Delete logo/favicon: UI patterns and component conventions confirmed
S735 CRM SaaS — Brand settings expansion: delete logo/favicon, dark/light logo variants, fix favicon in browser tab (Jun 22 at 9:27 PM)
1161 9:29p ⚖️ CRM SaaS — Brand settings expanded: delete logo/favicon + dark/light theme logos + favicon tab fix
1162 9:36p ⚖️ CRM SaaS — Brand settings expanded to support dark/light logo variants and favicon browser tab fix
1164 " 🔵 CRM SaaS — Brand settings architecture fully mapped for logo/favicon/theme expansion
1165 9:37p 🔵 CRM SaaS — Favicon bug root cause confirmed: no dynamic favicon in Next.js metadata, no favicon.ico in public/
1166 " ⚖️ CRM SaaS — Brand settings expansion: delete logo/favicon, dark/light logo variants, fix favicon in browser tab
1167 9:42p ⚖️ CRM SaaS — Brand settings expansion: delete logo/favicon, dark/light logo variants, fix favicon in browser tab
S736 frontend-reimpet ERP — Feature branch feat/branding-logos-favicon created (Jun 22 at 9:42 PM)
1168 9:45p 🟣 CRM SaaS — Dark/light logo columns added to settings table and branding query updated
1169 9:46p ⚖️ frontend-reimpet ERP — Branding spec written: dark/light logos, delete assets, favicon fix
1170 " ✅ frontend-reimpet ERP — Feature branch feat/branding-logos-favicon created
S739 ERP branding overhaul — dark/light logos, delete assets, favicon fix: spec written and branch created (Jun 22 at 9:46 PM)
S856 CRM SaaS ERP — User asked for step-by-step instructions to onboard a new client onto the ERP system (Jun 22 at 9:46 PM)
### Jul 3, 2026
1322 4:39p 🔵 CRM SaaS — proxy.ts matcher excludes favicon.ico but not favicon-default.ico, causing Supabase DNS calls for static asset requests
1323 4:40p 🔵 CRM SaaS — Supabase DNS resolution failure in development environment
1324 " 🔵 CRM SaaS — Supabase DNS resolution failure (ENOTFOUND) in local dev environment
1325 4:44p 🔵 CRM SaaS ERP — Supabase project URL not resolvable via DNS
### Jul 7, 2026
1388 9:19p 🔵 CRM SaaS ERP — New Business Onboarding Process Documented
1389 9:40p 🔵 CRM SaaS — /nuevo-negocio skill wizard full specification confirmed
1390 " 🔵 CRM SaaS — Supabase organization ID for WM Plataforma confirmed
1391 " 🟣 CRM SaaS — New Supabase project created for client "Reyes Magos"
1392 " 🟣 CRM SaaS — wm-reyesmagos bootstrap scripts all ran successfully
1393 " 🟣 CRM SaaS — wm-reyesmagos .env.local created with Supabase credentials
S858 CRM SaaS — /nuevo-negocio skill wizard full specification confirmed (Jul 7 at 9:40 PM)
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

Access 549k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>