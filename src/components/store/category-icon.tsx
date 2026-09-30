import { BatteryCharging, CircleDot, Cog, Disc, Droplet, Filter, Lightbulb, MoveVertical, Package, Zap, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  disc: Disc,
  filter: Filter,
  "move-vertical": MoveVertical,
  zap: Zap,
  "battery-charging": BatteryCharging,
  droplet: Droplet,
  cog: Cog,
  "circle-dot": CircleDot,
  lightbulb: Lightbulb,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Package;
  return <Icon className={className} aria-hidden />;
}
