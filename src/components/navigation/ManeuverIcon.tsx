import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Merge,
  Navigation2,
  Redo2,
  RotateCcw,
  RotateCw,
  Ship,
  Undo2,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  DEPART: Navigation2,
  STRAIGHT: ArrowUp,
  NAME_CHANGE: ArrowUp,
  TURN_LEFT: CornerUpLeft,
  TURN_SHARP_LEFT: CornerUpLeft,
  TURN_RIGHT: CornerUpRight,
  TURN_SHARP_RIGHT: CornerUpRight,
  TURN_SLIGHT_LEFT: ArrowUpLeft,
  RAMP_LEFT: ArrowUpLeft,
  FORK_LEFT: ArrowUpLeft,
  TURN_SLIGHT_RIGHT: ArrowUpRight,
  RAMP_RIGHT: ArrowUpRight,
  FORK_RIGHT: ArrowUpRight,
  UTURN_LEFT: Undo2,
  UTURN_RIGHT: Redo2,
  ROUNDABOUT_LEFT: RotateCcw,
  ROUNDABOUT_RIGHT: RotateCw,
  MERGE: Merge,
  FERRY: Ship,
  FERRY_TRAIN: Ship,
  ARRIVE: Flag,
};

/** Google Routes maneuver enum → icon; unknown maneuvers fall back to "continue". */
export function ManeuverIcon({ maneuver, className }: { maneuver: string; className?: string }) {
  const Icon = ICONS[maneuver] ?? ArrowUp;
  return <Icon aria-hidden className={className} strokeWidth={2.5} />;
}
