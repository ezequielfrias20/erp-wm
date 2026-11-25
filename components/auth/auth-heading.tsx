export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 text-center sm:mb-8">
      <h1 className="text-balance text-[25px] font-bold leading-tight tracking-tight text-foreground sm:text-[32px]">
        {title}
      </h1>
      <p className="mt-2 text-balance text-[14px] text-text-2">{subtitle}</p>
    </div>
  );
}
