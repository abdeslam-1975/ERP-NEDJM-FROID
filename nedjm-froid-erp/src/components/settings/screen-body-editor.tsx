"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCustomScreen } from "@/lib/actions/ui-screens";
import { Button } from "@/components/ui/button";
import { rhInput } from "@/components/rh/rh-ui";

export function ScreenBodyEditor({
  code,
  body,
  labelFr,
  labelAr,
  groupKey,
}: {
  code: string;
  body: string;
  labelFr?: string;
  labelAr?: string;
  groupKey?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(body);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-2 rounded-xl border border-border/60 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        start(async () => {
          const result = await saveCustomScreen({
            code,
            label_fr: labelFr || code,
            label_ar: labelAr || "",
            group_key: groupKey || "group.admin",
            body: text,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <p className="text-xs font-medium text-foreground/60">Texte de la page</p>
      <textarea className={`${rhInput} min-h-28`} value={text} onChange={(event) => setText(event.target.value)} />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        Enregistrer le texte
      </Button>
    </form>
  );
}
