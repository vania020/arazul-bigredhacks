import type { ReactNode } from "react";
import macawUrl from "@/assets/design-reference/Friendly Blue Macaw Mascot.png";

/** Ara, the ARAZUL mascot: the exact brand illustration (transparent PNG), never redrawn. */
export function Macaw({ className = "h-12 w-12", label }: { className?: string; label?: string }) {
  return (
    <img
      src={macawUrl}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`pointer-events-none select-none object-contain ${className}`}
    />
  );
}

/**
 * Small "guide" card: the mascot beside a short message, as in the reference designs.
 * Used sparingly (route insight, lower-exposure option, arrival, Ara's status messages).
 */
export function MacawCallout({
  children,
  onDismiss,
  dismissLabel,
  className = "",
  size = "h-14 w-14",
}: {
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  size?: string;
}) {
  return (
    <div className={`flex items-end gap-1 ${className}`}>
      <Macaw className={`${size} shrink-0 drop-shadow-sm`} />
      <div className="relative min-w-0 flex-1 rounded-2xl border bg-card px-4 py-3 text-sm leading-snug text-foreground shadow-float">
        {children}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-muted"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
