import type { Project, ProjectRegistration } from "@/lib/database.types";

type TicketEmailInput = {
  project: Project;
  registration: ProjectRegistration;
  qrSrc: string;
  code: string;
};

const DEFAULT_ACCENT = "#0ea5e9";

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value: string | null | undefined) {
  return escapeHtml(value).replaceAll("\n", "<br/>");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "Por confirmar";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Por confirmar";
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function fmtMoney(value: number | null | undefined, currency: "USD" | "VES") {
  const n = Number(value ?? 0);
  if (currency === "VES") {
    return "Bs. " + n.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeAccent(value: string | null | undefined) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_ACCENT;
}

function detailRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:12px;width:38%">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;font-weight:600">${value}</td>
    </tr>
  `;
}

export function buildProjectTicketEmailHtml({
  project,
  registration,
  qrSrc,
  code,
}: TicketEmailInput) {
  const accent = normalizeAccent(project.ticket_accent_color);
  const fullName = `${registration.first_name} ${registration.last_name}`.trim();
  const title = project.ticket_title || project.name;
  const subtitle = project.ticket_subtitle || project.description;
  const amount = fmtMoney(registration.amount, registration.currency);
  const amountUsd =
    registration.currency === "VES" && registration.amount_usd != null
      ? ` (${fmtMoney(registration.amount_usd, "USD")})`
      : "";
  const rate =
    registration.exchange_rate && registration.currency === "VES"
      ? `${Number(registration.exchange_rate).toLocaleString("es-VE", {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        })} Bs/USD`
      : "No aplica";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f3f6fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:720px;margin:0 auto">
      <div style="height:8px;background:${accent};border-radius:14px 14px 0 0"></div>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;overflow:hidden">
        <div style="padding:26px 28px 18px">
          ${
            project.logo_url
              ? `<img src="${escapeHtml(project.logo_url)}" alt="${escapeHtml(project.name)}" style="display:block;max-width:176px;max-height:72px;object-fit:contain;margin-bottom:18px" />`
              : ""
          }
          <p style="margin:0 0 7px;color:${accent};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Entrada confirmada</p>
          <h1 style="margin:0;color:#0f172a;font-size:28px;line-height:1.15;font-weight:800">${escapeHtml(title)}</h1>
          ${
            subtitle
              ? `<p style="margin:10px 0 0;color:#475569;font-size:14px;line-height:1.55">${nl2br(subtitle)}</p>`
              : ""
          }
        </div>

        <div style="padding:0 28px 26px">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:top;padding-right:18px">
                  <p style="margin:0 0 6px;color:#64748b;font-size:12px">Titular de la entrada</p>
                  <p style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:800">${escapeHtml(fullName)}</p>
                  <p style="margin:0;color:#475569;font-size:13px;line-height:1.55">
                    Cédula: <strong>${escapeHtml(registration.document)}</strong><br/>
                    Correo: <strong>${escapeHtml(registration.email)}</strong><br/>
                    Teléfono: <strong>${escapeHtml(registration.phone)}</strong>
                  </p>
                </td>
                <td style="width:170px;vertical-align:top;text-align:center">
                  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:10px">
                    <img src="${escapeHtml(qrSrc)}" alt="QR de entrada" width="148" height="148" style="display:block;width:148px;height:148px;margin:0 auto" />
                  </div>
                  <p style="margin:8px 0 0;color:#64748b;font-size:10px;line-height:1.35;word-break:break-all">${escapeHtml(code)}</p>
                </td>
              </tr>
            </table>
          </div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden">
            ${detailRow("Evento", escapeHtml(project.name))}
            ${detailRow("Fecha", escapeHtml(fmtDate(project.event_date)))}
            ${detailRow("Lugar", escapeHtml(project.location || "Por confirmar"))}
            ${detailRow("Organizador", escapeHtml(project.organizer_name || "World Medics"))}
            ${detailRow("Pago", escapeHtml(`${registration.payment_method} · ${amount}${amountUsd}`))}
            ${detailRow("Referencia", escapeHtml(registration.payment_reference || "No aplica"))}
            ${detailRow("Fecha de pago", escapeHtml(fmtDate(registration.paid_at)))}
            ${detailRow("Tasa usada", escapeHtml(rate))}
            ${detailRow("Estado de entrada", escapeHtml(registration.ticket_status))}
          </table>

          ${
            project.ticket_details
              ? `<div style="margin-top:18px;color:#334155;font-size:13px;line-height:1.6">${nl2br(project.ticket_details)}</div>`
              : ""
          }
          ${
            project.ticket_instructions
              ? `<div style="margin-top:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;color:#334155;font-size:13px;line-height:1.6">${nl2br(project.ticket_instructions)}</div>`
              : ""
          }
        </div>

        <div style="background:#0f172a;padding:18px 28px;color:#cbd5e1;font-size:12px;line-height:1.55">
          ${
            project.ticket_footer
              ? nl2br(project.ticket_footer)
              : "Esta entrada es personal. El QR será validado una sola vez al ingresar."
          }
          <div style="margin-top:10px;color:#94a3b8">
            ${escapeHtml(project.organizer_email || "")}
            ${project.organizer_email && project.organizer_phone ? " · " : ""}
            ${escapeHtml(project.organizer_phone || "")}
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildProjectTicketEmailText({
  project,
  registration,
  code,
}: Omit<TicketEmailInput, "qrSrc">) {
  const fullName = `${registration.first_name} ${registration.last_name}`.trim();
  const title = project.ticket_title || project.name;
  return [
    "Entrada confirmada",
    "",
    `Evento: ${title}`,
    `Titular: ${fullName}`,
    `Cédula: ${registration.document}`,
    `Fecha: ${fmtDate(project.event_date)}`,
    `Lugar: ${project.location || "Por confirmar"}`,
    `Código QR: ${code}`,
    "",
    project.ticket_instructions || "Presenta este correo al ingresar.",
  ].join("\n");
}

export function buildProjectPaymentRejectedEmailHtml({
  project,
  registration,
  whatsappUrl,
}: {
  project: Project;
  registration: ProjectRegistration;
  whatsappUrl: string;
}) {
  const accent = normalizeAccent(project.ticket_accent_color);
  const fullName = `${registration.first_name} ${registration.last_name}`.trim();

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pago no aprobado</title>
  </head>
  <body style="margin:0;background:#f3f6fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:680px;margin:0 auto">
      <div style="height:8px;background:${accent};border-radius:14px 14px 0 0"></div>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;overflow:hidden">
        <div style="padding:28px">
          ${
            project.logo_url
              ? `<img src="${escapeHtml(project.logo_url)}" alt="${escapeHtml(project.name)}" style="display:block;max-width:176px;max-height:72px;object-fit:contain;margin-bottom:18px" />`
              : ""
          }
          <p style="margin:0 0 7px;color:#dc2626;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Pago no aprobado</p>
          <h1 style="margin:0;color:#0f172a;font-size:26px;line-height:1.15;font-weight:800">${escapeHtml(project.name)}</h1>
          <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.6">
            Hola ${escapeHtml(fullName || " ")}, revisamos tu inscripción y el pago no pudo ser aprobado
            porque los datos enviados no coinciden con la operación recibida.
          </p>
          <div style="margin-top:18px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;color:#7f1d1d;font-size:13px;line-height:1.55">
            Si consideras que fue un error o necesitas reenviar la información del pago, comunícate
            directamente con la organización por WhatsApp.
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden">
            ${detailRow("Titular", escapeHtml(fullName))}
            ${detailRow("Cédula", escapeHtml(registration.document))}
            ${detailRow("Correo", escapeHtml(registration.email))}
            ${detailRow("Método de pago", escapeHtml(registration.payment_method))}
            ${detailRow("Referencia", escapeHtml(registration.payment_reference || "No aplica"))}
          </table>
          <p style="margin:24px 0 0">
            <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;padding:13px 18px;border-radius:10px">
              Contactar por WhatsApp
            </a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildProjectPaymentRejectedEmailText({
  project,
  registration,
  whatsappUrl,
}: {
  project: Project;
  registration: ProjectRegistration;
  whatsappUrl: string;
}) {
  const fullName = `${registration.first_name} ${registration.last_name}`.trim();
  return [
    "Pago no aprobado",
    "",
    `Evento: ${project.name}`,
    `Titular: ${fullName}`,
    `Cédula: ${registration.document}`,
    `Referencia: ${registration.payment_reference || "No aplica"}`,
    "",
    "Tu pago no pudo ser aprobado porque los datos enviados no coinciden con la operación recibida.",
    "Puedes contactar directamente con la organización por WhatsApp:",
    whatsappUrl,
  ].join("\n");
}
