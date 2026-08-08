import type { Role } from "@/lib/database.types";

type UserInviteEmailInput = {
  companyName: string;
  fullName: string;
  email: string;
  role: Role;
  branchName: string | null;
  inviteUrl: string;
  loginUrl: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value: string | null | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#0EA5E9";
}

export function buildUserInviteEmailHtml(input: UserInviteEmailInput): string {
  const companyName = escapeHtml(input.companyName || "World Medics");
  const fullName = escapeHtml(input.fullName);
  const email = escapeHtml(input.email);
  const role = escapeHtml(input.role);
  const branch = escapeHtml(input.branchName ?? "Todas las sucursales");
  const inviteUrl = escapeHtml(input.inviteUrl);
  const loginUrl = escapeHtml(input.loginUrl);
  const brand = safeColor(input.primaryColor);
  const logo = input.logoUrl ? escapeHtml(input.logoUrl) : null;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invitación a ${companyName}</title>
  </head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce4ee;border-radius:14px;overflow:hidden">
            <tr>
              <td style="padding:28px 28px 18px;border-bottom:1px solid #e6edf5">
                ${
                  logo
                    ? `<img src="${logo}" alt="${companyName}" style="display:block;max-width:170px;max-height:64px;object-fit:contain;margin-bottom:18px">`
                    : `<div style="font-size:18px;font-weight:800;color:#172033;margin-bottom:18px">${companyName}</div>`
                }
                <div style="display:inline-block;background:${brand};color:#ffffff;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700">
                  Acceso al ERP
                </div>
                <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.25;color:#172033">
                  ${fullName}, tu usuario fue creado
                </h1>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#536176">
                  Ya tienes una invitación activa para ingresar al sistema operativo de ${companyName}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6edf5;border-radius:12px;background:#f9fbfd">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#536176;border-bottom:1px solid #e6edf5">Correo</td>
                    <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#172033;border-bottom:1px solid #e6edf5" align="right">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#536176;border-bottom:1px solid #e6edf5">Rol</td>
                    <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#172033;border-bottom:1px solid #e6edf5" align="right">${role}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#536176">Sucursal</td>
                    <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#172033" align="right">${branch}</td>
                  </tr>
                </table>

                <div style="height:22px"></div>
                <a href="${inviteUrl}" style="display:block;background:${brand};color:#ffffff;text-decoration:none;text-align:center;border-radius:10px;padding:13px 18px;font-size:14px;font-weight:800">
                  Activar cuenta
                </a>
                <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#6b778c">
                  Si el botón no abre, copia este enlace en el navegador:<br>
                  <a href="${inviteUrl}" style="color:${brand};word-break:break-all">${inviteUrl}</a>
                </p>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6b778c">
                  Si ya activaste tu contraseña, entra directamente desde:
                  <a href="${loginUrl}" style="color:${brand}">${loginUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fbfd;border-top:1px solid #e6edf5;font-size:11px;line-height:1.5;color:#7b8798">
                Este correo fue enviado porque un administrador creó tu usuario en ${companyName}. No compartas tu contraseña con nadie.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildUserInviteEmailText(input: UserInviteEmailInput): string {
  return [
    `${input.fullName}, tu usuario fue creado en ${input.companyName || "World Medics"}.`,
    `Correo: ${input.email}`,
    `Rol: ${input.role}`,
    `Sucursal: ${input.branchName ?? "Todas las sucursales"}`,
    "",
    `Activa tu cuenta: ${input.inviteUrl}`,
    `Si ya tienes contraseña, inicia sesión: ${input.loginUrl}`,
  ].join("\n");
}
