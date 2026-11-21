import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getBranding } from "@/lib/queries/branding";
import { buildBrandStyle } from "@/lib/brand-css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const { companyName, faviconUrl } = await getBranding();
  // Multi-negocio: el nombre sale de Configuración (settings.company_name), nunca fijo.
  // Las páginas declaran sólo su parte («Punto de venta») y la plantilla añade el negocio.
  const name = companyName?.trim() || "ERP";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `ERP · ${name}`,
    // Un único origen de favicon: el subido si existe, si no el default de /public.
    // (Ya no existe app/favicon.ico, así que nada compite por la ruta /favicon.ico.)
    icons: { icon: [{ url: faviconUrl ?? "/favicon-default.ico" }] },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { primaryColor } = await getBranding();
  const brandStyle = buildBrandStyle(primaryColor);

  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        {brandStyle ? (
          <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
        ) : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
