import { useEffect, useRef, useState, type ReactNode } from "react";

export type Snap = "collapsed" | "half" | "expanded";

export function BottomSheet({ snap, onSnap, onHeight, children }: { snap: Snap; onSnap: (s: Snap) => void; onHeight: (h: number) => void; children: ReactNode }) {
  const [vh, setVh] = useState(800);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef({ y: 0, h: 0 });
  useEffect(() => {
    const u = () => setVh(window.innerHeight);
    u(); window.addEventListener("resize", u);
    return () => window.removeEventListener("resize", u);
  }, []);
  const heights: Record<Snap, number> = { collapsed: 132, half: Math.round(vh * 0.52), expanded: Math.round(vh * 0.9) };
  const h = drag ?? heights[snap];
  useEffect(() => { onHeight(h); }, [h, onHeight]);

  const end = () => {
    if (drag === null) return;
    const nearest = (Object.keys(heights) as Snap[]).reduce((a, b) => (Math.abs(heights[b] - drag) < Math.abs(heights[a] - drag) ? b : a));
    setDrag(null); onSnap(nearest);
  };

  return (
    <section className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t bg-card shadow-float"
      style={{ height: h, transition: drag === null ? "height .28s cubic-bezier(.2,.8,.2,1)" : "none" }}>
      <button
        aria-label="Resize panel"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, h }; setDrag(h); }}
        onPointerMove={(e) => drag !== null && setDrag(Math.min(heights.expanded, Math.max(heights.collapsed, start.current.h + start.current.y - e.clientY)))}
        onPointerUp={end} onPointerCancel={end}
        onClick={() => drag === null && onSnap(snap === "expanded" ? "half" : "expanded")}
        onKeyDown={(e) => { if (e.key === "ArrowUp") onSnap(snap === "collapsed" ? "half" : "expanded"); if (e.key === "ArrowDown") onSnap(snap === "expanded" ? "half" : "collapsed"); }}
        className="flex h-8 w-full shrink-0 touch-none items-center justify-center">
        <span className="h-1.5 w-12 rounded-full bg-border" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </section>
  );
}
