import { AuthArt } from "@/components/auth/auth-art";
import { BrandMark } from "@/components/shell/brand-mark";
import { getBranding } from "@/lib/queries/branding";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logoUrl, logoDarkUrl, companyName, loginImageUrl } = await getBranding();
  return (
    <div className="auth-backdrop flex min-h-dvh items-center justify-center p-3 sm:p-6 lg:p-10">
      <main className="auth-card grid w-full max-w-[480px] overflow-hidden rounded-[28px] border border-border bg-card p-2.5 lg:max-w-[1180px] lg:min-h-[min(760px,calc(100dvh-5rem))] lg:grid-cols-[1.1fr_1fr] lg:rounded-[36px] lg:p-3.5">
        <div className="relative h-28 overflow-hidden rounded-[18px] bg-surface-2 sm:h-44 lg:order-2 lg:h-auto lg:rounded-[10px_24px_24px_10px]">
          {loginImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={loginImageUrl}
              alt=""
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <AuthArt />
          )}
        </div>
        <div className="fadeup flex flex-col items-center px-4 pb-6 pt-6 sm:px-8 lg:px-12 lg:py-10">
          <BrandMark
            variant="login"
            logoUrl={logoUrl}
            logoDarkUrl={logoDarkUrl}
            companyName={companyName}
          />
          <div className="my-auto w-full max-w-[400px] pt-6 lg:pt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
