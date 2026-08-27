/**
 * Tipos del resumen que alimenta el shell (badges del sidebar y campana del header).
 *
 * Vive en un módulo neutro porque lo comparten un archivo `server-only`
 * (`lib/queries/shell.ts`) y componentes de cliente, y porque ahora viaja como
 * promesa: el layout no espera estos conteos para pintar la navegación.
 */

export type ShellNotification = {
  id: string;
  icon: "alert" | "cart" | "truck" | "refresh";
  title: string;
  body: string;
  time: string;
  tone: "danger" | "brand" | "success" | "muted";
};

export type ShellSummary = {
  lowStock: number;
  outStock: number;
  notifications: ShellNotification[];
};

export const EMPTY_SHELL_SUMMARY: ShellSummary = {
  lowStock: 0,
  outStock: 0,
  notifications: [],
};
