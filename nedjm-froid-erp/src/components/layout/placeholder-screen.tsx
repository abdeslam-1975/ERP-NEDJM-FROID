import { AppShell } from "@/components/layout/app-shell";

export default async function PlaceholderScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppShell title={title}>
      <div className="rounded-lg border border-border bg-surface p-8">
        <p className="text-sm font-medium text-brand">
          Écran réservé · شاشة محجوزة
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-2xl text-foreground/70">{description}</p>
      </div>
    </AppShell>
  );
}
