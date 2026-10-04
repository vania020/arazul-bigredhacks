import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { Macaw, MacawCallout } from "./brand/Macaw";

interface Props {
  message: string | null;
  celebrate: number;
  working?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ara, the macaw guide. Speaks only on meaningful state changes (same messages and timing as
 * before), as a small mascot callout; otherwise stays out of the way of the map.
 */
export function AraBird({ message, celebrate, working, className = "", style }: Props) {
  const { t } = useI18n();
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

  if (!visible && !working) return null;
  return (
    <div className={`pointer-events-none ${className}`} style={style}>
      {visible ? (
        <div role="status" aria-live="polite" className="bubble-in pointer-events-auto">
          <MacawCallout
            size={`h-14 w-14 ${anim ? "ara-bounce" : ""}`}
            onDismiss={() => setVisible(null)}
            dismissLabel={t("close")}
          >
            <p className="pr-6 font-medium">{visible}</p>
          </MacawCallout>
        </div>
      ) : (
        <Macaw className="ara-working h-12 w-12 drop-shadow" label="Ara" />
      )}
    </div>
  );
}
