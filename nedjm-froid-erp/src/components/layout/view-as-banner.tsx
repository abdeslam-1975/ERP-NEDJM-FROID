"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { toast } from "sonner";
import { stopViewAs } from "@/lib/actions/role-rights";
import type { WorkspaceViewAs } from "@/lib/auth/types";

export function ViewAsBanner({ viewAs }: { viewAs: WorkspaceViewAs }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function leave() {
    startTransition(async () => {
      const res = await stopViewAs();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/administration/permissions?role=${viewAs.roleId}`);
      router.refresh();
    });
  }

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-50 ring-4 ring-orange-400/80 ring-inset print:hidden" />
      <div
        role="status"
        className="fixed right-4 bottom-4 z-50 flex max-w-[min(34rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 pr-2.5 pl-4 text-sm text-white shadow-[0_18px_40px_rgba(234,88,12,0.35)] print:hidden"
      >
        <Eye className="size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">Vous voyez le logiciel comme « {viewAs.roleLabel} »</p>
          <p className="text-xs text-white/85">Menus, onglets et boutons de ce rôle · les données restent celles de votre compte.</p>
        </div>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-60"
        >
          <LogOut className="size-3.5" aria-hidden />
          {pending ? "Retour…" : "Quitter"}
        </button>
      </div>
    </>
  );
}
