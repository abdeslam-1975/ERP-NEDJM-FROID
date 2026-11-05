import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenBodyEditor } from "@/components/settings/screen-body-editor";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomScreenPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) notFound();
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("sys_ui_custom_screens")
    .select("code, label_fr, label_ar, group_key, body")
    .eq("code", code)
    .maybeSingle();
  if (!data) notFound();

  return (
    <AppShell title={data.label_fr}>
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <h1 className="font-display text-2xl font-semibold text-foreground">{data.label_fr}</h1>
          {data.label_ar ? (
            <p className="text-sm text-foreground/50" dir="rtl">
              {data.label_ar}
            </p>
          ) : null}
        </header>
        {data.body ? <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{data.body}</p> : null}
        {workspace.isSuperAdmin ? (
          <ScreenBodyEditor
            code={data.code}
            body={data.body}
            labelFr={data.label_fr}
            labelAr={data.label_ar}
            groupKey={data.group_key}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
