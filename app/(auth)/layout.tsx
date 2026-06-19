import { Logo } from "@/components/shell/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, var(--brand-soft), transparent 70%)",
        }}
      />
      <div className="w-full max-w-[400px] fadeup">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={48} />
          <h1 className="mt-4 text-[19px] font-bold tracking-tight text-foreground">
            World Medics
          </h1>
          <p className="text-[12.5px] text-text-3">ERP · uniformes médicos</p>
        </div>
        {children}
      </div>
    </div>
  );
}
