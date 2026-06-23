import { cn } from "@/lib/utils";
import { Logo } from "@/components/shell/logo";

/** Renders the uploaded logo when present, else falls back to the glyph + name.
 *  `login` = centered block; `sidebar` = horizontal row (logo-only when collapsed). */
export function BrandMark({
  logoUrl,
  logoDarkUrl = null,
  companyName,
  variant,
  collapsed = false,
}: {
  logoUrl: string | null;
  logoDarkUrl?: string | null;
  companyName: string | null;
  variant: "login" | "sidebar";
  collapsed?: boolean;
}) {
  const name = companyName?.trim() || "World Medics";

  const lightSrc = logoUrl ?? logoDarkUrl;
  const darkSrc = logoDarkUrl ?? logoUrl;

  if (lightSrc && darkSrc) {
    const frameClass =
      variant === "login"
        ? "mx-auto flex h-24 w-full max-w-[280px] items-center justify-center"
        : collapsed
          ? "flex size-11 items-center justify-center"
          : "flex h-12 w-full max-w-[190px] items-center justify-start";
    const imageClass =
      variant === "login"
        ? "scale-[1.18]"
        : collapsed
          ? "scale-[1.12]"
          : "scale-[1.22]";

    return (
      <span className={cn("overflow-visible", frameClass)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightSrc}
          alt={name}
          className={cn("h-full w-full object-contain", imageClass, "block dark:hidden")}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={darkSrc}
          alt={name}
          className={cn("h-full w-full object-contain", imageClass, "hidden dark:block")}
        />
      </span>
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
