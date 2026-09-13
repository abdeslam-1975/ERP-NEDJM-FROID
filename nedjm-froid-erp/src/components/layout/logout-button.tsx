"use client";

import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary" className="h-9 px-3 text-xs">
        Déconnexion
      </Button>
    </form>
  );
}
