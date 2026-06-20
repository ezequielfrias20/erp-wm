# Primer ingreso al sistema — World Medics ERP

Guía paso a paso para entrar por primera vez y dar de alta al resto del personal.
El registro es **solo por invitación**: no existe registro público abierto. El acceso al
ERP lo controla la tabla `wm.profiles` (no basta con tener cuenta en Supabase Auth).

---

## 1. Requisitos previos (una sola vez)

1. Tener `.env.local` con las variables (ya están configuradas en este repo):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BCV_API`
2. Instalar dependencias y levantar el proyecto:
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```

---

## 2. Iniciar sesión como administrador (cuenta sembrada)

Ya existe un **Super Admin** listo para entrar (creado en la base de datos):

| Campo | Valor |
|---|---|
| **URL** | `http://localhost:3000/login` |
| **Correo** | `pedro.salas@worldmedics.ve` |
| **Contraseña** | `WorldMedics.2026` |
| **Rol** | Super Admin (acceso total a los 9 módulos) |

Pasos:
1. Abre `http://localhost:3000` → te redirige a `/login`.
2. Ingresa el correo y la contraseña de arriba → **Entrar**.
3. El sistema valida la sesión, enlaza tu perfil del ERP (`claim_profile`) y te lleva al **Dashboard**.

> Qué pasa por dentro: `middleware.ts` protege todas las rutas de `app/(app)/`. Al iniciar
> sesión, `claim_profile` busca tu perfil en `wm.profiles` por `user_id` y, si no está
> enlazado aún, lo enlaza por **correo**. Si tu correo no tiene perfil activo, se cierra la
> sesión y se niega el acceso (así el ERP queda aislado del CRM que comparte `auth.users`).

**Recomendado:** cambia esta contraseña tras el primer ingreso desde
**Supabase → Authentication → Users** (o configurando SMTP y usando "reset password").

---

## 3. Dar de alta al resto del personal (invitaciones)

El personal del handoff (Carlos Rivas, Ana Torres, etc.) ya está sembrado en `wm.profiles`
con su rol y sucursal, pero **sin cuenta de acceso** (aún no han definido contraseña).
Para que cualquiera de ellos —o un usuario nuevo— pueda entrar:

### 3.1 Crear/confirmar la invitación (lo hace un admin)
1. Entra a **Usuarios** (menú lateral).
2. Para alguien nuevo: botón **Invitar usuario** → completa nombre, correo, cargo y sucursal → **Guardar**.
   (Para el personal ya sembrado este paso no hace falta: su perfil ya existe.)
3. Esto crea/actualiza la fila en `wm.profiles` con estado **Activo** y `user_id` vacío.

### 3.2 Activar la cuenta (lo hace la persona invitada)
1. La persona abre **`http://localhost:3000/invite`**.
2. Escribe **el mismo correo** con el que fue invitada + define su contraseña (mín. 8).
3. Al enviar, se crea su cuenta en Supabase Auth y `claim_profile` la enlaza a su perfil
   por correo → entra directo al Dashboard con el rol/sucursal que le asignó el admin.

> Hoy el envío del enlace de invitación es **manual** (comparte la URL `/invite`). Para
> enviar correos automáticos de invitación/recuperación hay que configurar **SMTP** en
> Supabase (ver §5).

---

## 4. Roles y permisos

- Los permisos se gestionan en **Usuarios → Matriz de permisos** (módulo × rol).
  Cada celda cicla entre: **Control total (2)**, **Solo lectura (1)**, **Sin acceso (0)**.
- El menú lateral y las acciones de cada módulo respetan estos permisos automáticamente.
- Roles disponibles: Super Admin, Administrador, Gerente, Vendedor, Inventario, Cajero.

---

## 5. Ajustes pendientes en el panel de Supabase (producción)

Estos no se hacen por código; se configuran una vez en el dashboard de Supabase
(proyecto `crm_cubo_labs`):

1. **Registro habilitado a nivel Auth** — *Authentication → Providers → Email* debe permitir
   "sign up". El control real de acceso lo hace el ERP (perfil en `wm.profiles`), así que
   dejarlo habilitado es seguro y es lo que necesita el flujo `/invite`.
2. **Confirmación de correo** — *Authentication → Providers → Email → "Confirm email"*:
   - **Desactivado** (recomendado mientras no haya SMTP): tras `/invite` la persona entra al instante.
   - **Activado**: la persona debe confirmar su correo por enlace antes de entrar → requiere SMTP.
3. **SMTP** — *Authentication → Settings → SMTP* para enviar invitaciones y "olvidé mi contraseña".
4. **Leaked password protection** — *Authentication → Settings* (corrige el advisor WARN).

---

## 6. Datos y utilidades del sistema

- **Sucursal activa**: selector en la barra superior; casi todo el sistema filtra por ella
  (Dashboard, Inventario, Reportes, POS). "Todas las sucursales" = vista consolidada.
- **Tasa BCV**: se obtiene en vivo de `dolarapi` (oficial) y se usa para mostrar Bs. junto al USD.
- **Importar inventario**: Inventario → **Importar** (CSV `sku, sucursal, stock, minimo`).
- **Foto de perfil / logo / favicon**: Configuración → Mi perfil / Marca (se suben a Supabase Storage).
