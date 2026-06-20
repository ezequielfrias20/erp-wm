import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Round avatar: shows the uploaded image when present, else gradient initials. */
export function AvatarBubble({
  name,
  url,
  size = 30,
  className,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: "linear-gradient(140deg,#6366F1,#0EA5E9)",
      }}
    >
      {initials(name)}
    </span>
  );
}
