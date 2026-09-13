"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  logoutAction,
  type AuthActionResult,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const initial: AuthActionResult | null = null;

const fieldClass =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initial,
  );

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        <div>
          <label
            htmlFor="current_password"
            className="block text-sm font-medium text-foreground"
          >
            Mot de passe actuel (temporaire)
            <span className="mt-0.5 block text-xs font-normal text-foreground/50">
              كلمة المرور الحالية (المؤقتة)
            </span>
          </label>
          <input
            id="current_password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="new_password"
            className="block text-sm font-medium text-foreground"
          >
            Nouveau mot de passe
            <span className="mt-0.5 block text-xs font-normal text-foreground/50">
              كلمة المرور الجديدة
            </span>
          </label>
          <input
            id="new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium text-foreground"
          >
            Confirmer le nouveau mot de passe
            <span className="mt-0.5 block text-xs font-normal text-foreground/50">
              تأكيد كلمة المرور الجديدة
            </span>
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            className={fieldClass}
          />
        </div>

        {state && !state.ok ? (
          <div
            role="alert"
            className="rounded-md border border-alert-critical/40 bg-alert-critical/10 px-3 py-2 text-sm text-alert-critical"
          >
            {state.error}
          </div>
        ) : null}

        <Button type="submit" disabled={pending} className="h-11 w-full">
          {pending ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
        </Button>
      </form>

      <form action={logoutAction}>
        <Button
          type="submit"
          variant="secondary"
          className="h-10 w-full"
          disabled={pending}
        >
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
