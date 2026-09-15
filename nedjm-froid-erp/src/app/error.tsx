"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <p className="font-display text-2xl font-bold text-brand">NEDJM FROID</p>
        <h1 className="mt-5 font-display text-xl font-semibold">
          Page indisponible
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          Le serveur n&apos;a pas répondu à temps. Réessayez.
          <span className="mt-1 block">الخادم لم يستجب. أعد المحاولة.</span>
        </p>
        <Button className="mt-6 h-11 w-full" onClick={() => reset()}>
          Réessayer · إعادة المحاولة
        </Button>
      </div>
    </div>
  );
}
