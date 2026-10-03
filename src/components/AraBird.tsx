import { useEffect, useState } from "react";

interface Props {
  message: string | null;
  celebrate: number;
  working?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Ara: a small geometric macaw-inspired guide. Speaks only on meaningful state changes. */
export function AraBird({ message, celebrate, working, className = "", style }: Props) {
  const [visible, setVisible] = useState<string | null>(null);
  const [anim, setAnim] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(message);
    const id = setTimeout(() => setVisible(null), 4500);
    return () => clearTimeout(id);
  }, [message]);

  useEffect(() => {
    if (!celebrate) return;
    setAnim(true);
    const id = setTimeout(() => setAnim(false), 1900);
    return () => clearTimeout(id);
  }, [celebrate]);

  return (
    <div className={`pointer-events-none flex items-end gap-2 ${className}`} style={style}>
      {visible && (
        <div
          role="status"
          aria-live="polite"
          className="bubble-in mb-6 max-w-[min(65vw,200px)] rounded-lg border bg-card px-3 py-2 text-xs font-medium leading-snug text-foreground shadow-soft"
        >
          {visible}
        </div>
      )}
      <svg
        viewBox="0 0 64 64"
        className={`h-10 w-10 shrink-0 drop-shadow ${anim ? "ara-bounce" : ""} ${working ? "ara-working" : ""}`}
        aria-label="Ara"
        role="img"
      >
        <path d="M20 54l6-14 6 4-6 12z" className="fill-deep" />
        <path d="M30 56l2-13 6 2-3 12z" className="fill-primary" />
        <path
          d="M18 40c0-14 8-26 20-26s14 10 12 18-10 14-20 14c-6 0-12-2-12-6z"
          className="fill-primary"
        />
        <g className={anim ? "ara-flap" : ""}>
          <path d="M22 36c4-10 12-14 20-12-4 4-6 10-6 16-6 0-10-2-14-4z" className="fill-deep" />
          <path d="M26 35c3-6 8-8 13-8-2 3-3 6-3 10-4 0-7-1-10-2z" className="fill-sky" />
        </g>
        <path d="M36 14c4-4 10-4 14 0-2 0-4 1-5 3z" className="fill-sky" />
        <circle cx="44" cy="22" r="5" className="fill-sky-soft" />
        <circle cx="45" cy="22" r="2.2" className="fill-navy" />
        <path d="M50 24c5 0 8 3 7 7-2-2-5-3-8-3z" className="fill-navy" />
      </svg>
    </div>
  );
}
