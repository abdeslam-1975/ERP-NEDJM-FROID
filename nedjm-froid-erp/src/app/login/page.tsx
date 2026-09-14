import { LoginForm } from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/auth/safe-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next, "/");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-brand-muted),_transparent_55%)]"
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-brand">
            NEDJM FROID
          </p>
          <p className="mt-1 text-xs text-foreground/55">
            نجم فرويد · ERP Cloud
          </p>
          <h1 className="mt-5 font-display text-xl font-semibold text-foreground">
            Connexion à l&apos;espace de travail
          </h1>
          <p className="mt-1 text-sm text-foreground/65">
            Module 1 — Authentification &amp; paramétrage
          </p>
        </div>
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
