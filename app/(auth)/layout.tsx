import { BrandMark } from "@/components/shell/brand-mark";
import { getBranding } from "@/lib/queries/branding";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logoUrl, companyName } = await getBranding();
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
          <BrandMark variant="login" logoUrl={logoUrl} companyName={companyName} />
        </div>
        {children}
      </div>
    </div>
  );
}
