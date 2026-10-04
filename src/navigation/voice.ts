import type { Progress } from "./tracker";

export const speechSupported = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  typeof SpeechSynthesisUtterance !== "undefined";

/** Newer prompts replace queued ones so stale directions are never read out. */
export function speak(text: string, lang: string) {
  if (!speechSupported() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice is optional */
  }
}

export function stopSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** iOS/Safari only allow speech after a user gesture: call from the Start click. */
export function primeSpeech() {
  if (!speechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice is optional */
  }
}

export interface VoicePrompt {
  key: string;
  /** true for the final "now" prompt (no distance prefix). */
  now: boolean;
}

/**
 * Picks at most one prompt per maneuver per distance band. Once a closer band has been spoken,
 * farther bands for the same maneuver are suppressed, so nothing repeats while the user waits.
 */
export function nextVoicePrompt(
  progress: Progress,
  bandsM: readonly number[],
  announced: Set<string>,
  routeVersion: number,
): VoicePrompt | null {
  if (progress.departing) return null;
  const target = progress.primary === "arrive" ? "arrive" : String(progress.primary.index);
  const base = `${routeVersion}:${target}`;
  let band = -1;
  bandsM.forEach((m, i) => {
    if (progress.distanceToManeuverM <= m) band = i;
  });
  if (band < 0) return null;
  for (let k = band; k < bandsM.length; k++) if (announced.has(`${base}:${k}`)) return null;
  return { key: `${base}:${band}`, now: band === bandsM.length - 1 };
}
