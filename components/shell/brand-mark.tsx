import { cn } from "@/lib/utils";
import { Logo } from "@/components/shell/logo";

/** Renders the uploaded logo when present, else falls back to the glyph + name.
 *  `login` = centered block; `sidebar` = horizontal row (logo-only when collapsed). */
export function BrandMark({
  logoUrl,
  companyName,
  variant,
  collapsed = false,
}: {
  logoUrl: string | null;
  companyName: string | null;
  variant: "login" | "sidebar";
  collapsed?: boolean;
}) {
  const name = companyName?.trim() || "World Medics";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={cn(
          "object-contain",
          variant === "login" ? "mx-auto max-h-16 w-auto" : "max-h-9 w-auto",
        )}
      />
    );
  }

  if (variant === "login") {
    return (
      <div className="flex flex-col items-center text-center">
        <Logo size={48} />
        <h1 className="mt-4 text-[19px] font-bold tracking-tight text-foreground">
          {name}
        </h1>
        <p className="text-[12.5px] text-text-3">ERP · uniformes médicos</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[11px]">
      <Logo size={36} />
      {!collapsed && (
        <div className="flex flex-col overflow-hidden whitespace-nowrap leading-[1.15]">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            {name}
          </span>
          <span className="text-[11px] font-medium text-text-3">
            ERP · uniformes médicos
          </span>
        </div>
      )}
    </div>
  );
}
