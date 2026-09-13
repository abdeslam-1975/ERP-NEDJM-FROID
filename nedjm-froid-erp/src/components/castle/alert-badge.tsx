type Tone = "critical" | "warning" | "success" | "info";

const tones: Record<Tone, string> = {
  critical: "bg-alert-critical/15 text-alert-critical ring-alert-critical/30",
  warning: "bg-alert-warning/15 text-alert-warning ring-alert-warning/30",
  success: "bg-alert-success/15 text-alert-success ring-alert-success/30",
  info: "bg-brand-muted text-brand ring-brand/30",
};

export function AlertBadge({
  label,
  tone = "info",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
