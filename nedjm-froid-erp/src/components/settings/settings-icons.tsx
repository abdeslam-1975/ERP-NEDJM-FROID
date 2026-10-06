import {
  CalendarDays,
  FileStack,
  Gauge,
  History,
  IdCard,
  KeyRound,
  Landmark,
  LayoutGrid,
  ListChecks,
  Lock,
  Palette,
  ReceiptText,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { SettingsIcon } from "@/lib/ui/settings-center";

const ICONS: Record<SettingsIcon, LucideIcon> = {
  gauge: Gauge,
  wallet: Wallet,
  receipt: ReceiptText,
  scale: Scale,
  idcard: IdCard,
  list: ListChecks,
  calendar: CalendarDays,
  files: FileStack,
  landmark: Landmark,
  cart: ShoppingCart,
  users: Users,
  shield: ShieldCheck,
  grid: LayoutGrid,
  key: KeyRound,
  palette: Palette,
  lock: Lock,
  history: History,
};

export function SettingsGlyph({ icon, className }: { icon: SettingsIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={1.9} aria-hidden />;
}
