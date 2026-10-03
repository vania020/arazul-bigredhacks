/// <reference types="google.maps" />
/* Google Maps JS API loader (dynamic library import bootstrap). Key comes only from env. */
let loadPromise: Promise<void> | null = null;
let authFailed = false;

export function getApiKey(): string | undefined {
  const k = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
  return k && k.trim() ? k : undefined;
}

export function mapsAuthFailed() {
  return authFailed;
}

export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;
  const key = getApiKey();
  if (!key) return Promise.reject(new Error("MISSING_KEY"));
  loadPromise = new Promise<void>((resolve, reject) => {
    const w = window as Window & { gm_authFailure?: () => void; __arazulMapsReady?: () => void };
    w.gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event("arazul-maps-auth-failure"));
    };
    w.__arazulMapsReady = () => resolve();
    const params = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback: "__arazulMapsReady",
    });
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = () => reject(new Error("SCRIPT_LOAD_FAILED"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export async function importLib<T = unknown>(name: string): Promise<T> {
  await loadGoogleMaps();
  return (await google.maps.importLibrary(name)) as T;
}
