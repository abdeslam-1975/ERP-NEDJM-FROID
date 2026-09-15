"use client";

import { useActionState } from "react";
import { loginAction, type AuthActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const initial: AuthActionResult | null = null;

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          Adresse e-mail
          <span className="mt-0.5 block text-xs font-normal text-foreground/50">
            البريد الإلكتروني
          </span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          placeholder="prenom@nedjm-froid.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Mot de passe
          <span className="mt-0.5 block text-xs font-normal text-foreground/50">
            كلمة المرور
          </span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
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

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </Button>

      <p className="text-center text-xs text-foreground/55">
        Accès sur invitation uniquement · الدخول بدعوة فقط
      </p>
    </form>
  );
}
