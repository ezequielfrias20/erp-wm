import { cn } from "@/lib/utils";

/** World Medics brand mark (cross glyph on a brand-gradient tile), ported from the handoff. */
export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const glyph = Math.round(size * 0.53);
  return (
    <div
      className={cn(
        "flex flex-none items-center justify-center rounded-[10px]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(140deg,var(--brand),var(--brand-2))",
        boxShadow: "0 6px 16px -6px var(--brand)",
      }}
    >
      <svg viewBox="0 0 24 24" width={glyph} height={glyph}>
        <path
          d="M9.6 3h4.8v4.2H19v4.8h-4.6V19H9.6v-7H5V7.2h4.6V3Z"
          fill="#fff"
        />
      </svg>
    </div>
  );
}
