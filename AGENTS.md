<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [erp] recent context, 2026-06-20 6:57pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (27,894t read) | 811,760t work | 97% savings

### Jun 19, 2026
1018 2:46p 🔵 CRM SaaS — Live BCV rate is Bs. 607.39/USD, not the Bs. 113.00 hardcoded in design mock data
1019 2:53p ⚖️ CRM SaaS — World Medics ERP full implementation plan written and locked
1020 2:58p ⚖️ CRM SaaS — World Medics ERP implementation re-initiated via claude_design MCP
1021 3:03p 🟣 CRM SaaS — World Medics ERP Next.js project scaffolded
1022 " ✅ CRM SaaS — World Medics ERP runtime dependencies installed
1023 3:04p 🔵 CRM SaaS — shadcn/ui latest CLI dropped -b slate flag; use -d --yes instead
1024 " 🟣 CRM SaaS — shadcn/ui component library fully installed for World Medics ERP
1025 3:06p 🟣 CRM SaaS — World Medics ERP design tokens fully ported to globals.css
1026 3:07p ✅ CRM SaaS — World Medics ERP .env.local configured with Supabase + BCV API keys
1027 " 🟣 CRM SaaS — Supabase client/server helpers created targeting wm schema
1028 " 🟣 CRM SaaS — Auth middleware implemented with route gating and session refresh
### Jun 20, 2026
1029 5:33a 🔵 CRM SaaS — /invite user creation does not enable login
1030 5:34a 🔵 CRM SaaS — Supabase invite flow does not create a usable password login
1031 " 🔵 CRM SaaS — Supabase user invite flow does not set password; new users cannot log in via email/password
1032 5:35a 🔵 CRM SaaS — wm.profiles record has null user_id, blocking login
1033 5:36a 🔵 CRM SaaS — Supabase invite-based user creation cannot set password directly
S675 CRM SaaS — Supabase invite-based user creation cannot set password directly (Jun 20 at 5:36 AM)
1034 5:48a ⚖️ CRM SaaS — Ventas (POS) flow refinements planned: inline client creation, IVA toggle, reference number
1036 " 🔵 CRM SaaS — POS module current architecture confirmed before sale flow refinements
1037 5:49a 🔵 CRM SaaS — wm.sales schema and create_sale RPC fully mapped before refinements
1039 11:40a ⚖️ CRM SaaS — Comprehensive Feature Plan: Productos, Ventas, and Reportes Modules
1041 " 🔵 CRM SaaS — Productos & Inventario Module Architecture Fully Mapped
1042 " 🔵 CRM SaaS — Reportes Module Architecture Fully Mapped: PDF is window.print(), No Invoice Template Exists
1043 11:41a 🔵 CRM SaaS — Ventas POS Module Fully Mapped: Payment, Draft, Customer, and Invoice Gaps Confirmed
1045 11:50a ⚖️ CRM SaaS — Comprehensive Feature Plan Requested Across Productos, Ventas, and Reportes
1046 " ⚖️ CRM SaaS — Comprehensive Multi-Module Feature Plan Requested
1047 11:51a ⚖️ CRM SaaS — Comprehensive Large-Scale Feature Plan Requested Across Productos, Ventas, and Reportes
1048 11:53a ⚖️ CRM SaaS — Comprehensive large-scale feature plan requested across Productos, Ventas, and Reportes
1049 " ⚖️ CRM SaaS — Large-scale feature plan requested across Productos, Ventas, and Reportes modules
1050 11:54a ⚖️ CRM SaaS — Comprehensive multi-module feature plan requested and organized by priority
1051 11:55a ⚖️ CRM SaaS — Comprehensive Large-Scale Feature Plan Requested Across Products, Sales, and Reports
1052 " ⚖️ CRM SaaS — Comprehensive Large-Scale Feature Plan Requested Across Products, Sales, and Reports
1053 11:56a ⚖️ CRM SaaS — Comprehensive multi-module feature plan requested and recorded
1054 11:57a ⚖️ CRM SaaS — Comprehensive Feature Plan Requested Across Products, Sales, and Reports
1055 11:58a ⚖️ CRM SaaS — Comprehensive feature roadmap specified for Products, Sales, and Reports modules with structured implementation phases
1056 " ⚖️ CRM SaaS — Large-Scale Feature Implementation Plan Requested Across Products, Sales, and Reports
1057 11:59a 🟣 CRM SaaS Configuración — Brands (Marcas) added to Inventario settings section
1059 6:29p ⚖️ CRM SaaS — Ventas POS modal "falta" field planned to show amount in Bs
1060 6:30p ⚖️ CRM SaaS — modal "falta" field planned to display amount in Bs
1061 " ⚖️ CRM SaaS — Ventas modal "Falta" field planned to display amount in Bs
1062 6:31p 🔵 CRM SaaS ERP — POS payment modal structure confirmed for "Falta" Bs display task
1063 " 🟣 CRM SaaS — POS mixed payment modal "Falta" now shows Bs equivalent amount
1064 " 🔵 CRM SaaS ERP — ESLint reveals 4 pre-existing errors in clientes, shell, sucursales, and usuarios components
1065 " 🟣 CRM SaaS ERP — POS view fully rewritten with mixed payments, drafts, customer lookup, and printable invoice
1066 6:34p 🟣 CRM SaaS — POS payment modal "Falta" field now displays Bs (Bolivianos) amount
1067 6:35p 🔵 CRM SaaS — MixedPaymentForm Bs display: confirmed exact implementation in pos-view.tsx
1068 6:37p 🔵 CRM SaaS — POS payment modal horizontal scroll and decimal precision bugs reported
1069 6:38p 🔴 CRM SaaS — POS mixed payment modal horizontal scroll and decimal precision bugs fixed
1070 " 🟣 CRM SaaS — POS mixed payment row shows inline validation error for invalid decimal amounts
1071 6:50p ⚖️ CRM SaaS — Ventas POS flow: customer enforcement, sale animation, and invoice modal redesign planned
1072 " 🔵 CRM SaaS — POS flow code structure mapped prior to three-feature implementation

Access 812k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>