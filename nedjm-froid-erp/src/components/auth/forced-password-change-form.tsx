"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  logoutAction,
  type AuthActionResult,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

const initial: AuthActionResult | null = null;

export function ForcedPasswordChangeForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initial,
  );

  return (
    <div className="space-y-5">
      <div
        role="status"
        className="rounded-md border border-alert-warning/40 bg-alert-warning/10 px-3 py-2 text-sm text-foreground"
      >
        Un administrateur a défini votre mot de passe initial. Vous devez en
        choisir un nouveau avant d&apos;accéder à l&apos;ERP.
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="current_password"
            className="block text-sm font-medium"
          >
            Mot de passe temporaire / actuel
          </label>
          <PasswordInput
            id="current_password"
            name="current_password"
            autoComplete="current-password"
            required
            minLength={8}
            wrapperClassName="mt-1.5"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label htmlFor="new_password" className="block text-sm font-medium">
            Nouveau mot de passe (min. 10)
          </label>
          <PasswordInput
            id="new_password"
            name="new_password"
            autoComplete="new-password"
            required
            minLength={10}
            wrapperClassName="mt-1.5"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label
            htmlFor="confirm_password"
            className="block text-sm font-medium"
          >
            Confirmer le nouveau mot de passe
          </label>
          <PasswordInput
            id="confirm_password"
            name="confirm_password"
            autoComplete="new-password"
            required
            minLength={10}
            wrapperClassName="mt-1.5"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
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
          {pending ? "Enregistrement…" : "Enregistrer et continuer"}
        </Button>
      </form>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" className="w-full">
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
