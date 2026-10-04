import type { ReactNode } from "react";

/**
 * Collapsible secondary section (progressive disclosure): details stay available and in the
 * DOM, but don't compete with the primary route information.
 */
export function SheetSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-2xl border bg-card shadow-soft" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-deep [&::-webkit-details-marker]:hidden">
        {icon && <span className="text-primary">{icon}</span>}
        <span className="min-w-0 flex-1">{title}</span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
