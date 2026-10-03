import { useState } from "react";
import { useI18n } from "@/i18n";
import { tripToolsText } from "@/i18n/trip-tools";
import { Button } from "@/components/ui/button";
import { buildTripSummary, createTripUrl, type TripToolsProps } from "@/services/trip-tools";
export function TripTools(props: TripToolsProps) {
  const { lang } = useI18n();
  // A new trip must not display a previous link or late clipboard result.
  return <TripToolsControls key={JSON.stringify([props.trip, lang])} {...props} />;
}
function TripToolsControls(props: TripToolsProps) {
  const { lang } = useI18n(),
    t = tripToolsText[lang];
  const [manual, setManual] = useState(""),
    [status, setStatus] = useState(""),
    [local, setLocal] = useState(false);
  const share = async () => {
    setStatus("");
    setManual("");
    let url: string;
    try {
      url = createTripUrl(props.trip, window.location.href);
    } catch {
      setStatus(t.failed);
      return;
    }
    setLocal(
      ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) ||
        window.location.hostname.endsWith(".localhost"),
    );
    if (navigator.share) {
      try {
        await navigator.share({ title: "ARAZUL", url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(t.copied);
    } catch {
      setManual(url);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([buildTripSummary(props, lang)], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "arazul-trip.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={share}>
          {t.share}
        </Button>
        <Button variant="outline" onClick={download}>
          {t.download}
        </Button>
      </div>
      <p className="text-xs text-text-secondary">{t.notice}</p>
      {local && <p className="text-xs text-text-secondary">{t.local}</p>}
      <p role="status" className="text-xs">
        {status}
      </p>
      {manual && (
        <label className="block text-xs">
          {t.manual}
          <input
            className="mt-1 w-full rounded border bg-background p-2"
            value={manual}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}
