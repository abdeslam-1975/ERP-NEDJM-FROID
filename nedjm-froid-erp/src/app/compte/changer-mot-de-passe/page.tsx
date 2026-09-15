import { ForcedPasswordChangeForm } from "@/components/auth/forced-password-change-form";

export default function ChangePasswordPage() {
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
          <h1 className="mt-5 font-display text-xl font-semibold text-foreground">
            Changement de mot de passe obligatoire
          </h1>
          <p className="mt-1 text-sm text-foreground/65">
            Sécurité du compte · تغيير كلمة المرور إلزامي
          </p>
        </div>
        <ForcedPasswordChangeForm />
      </div>
    </div>
  );
}
