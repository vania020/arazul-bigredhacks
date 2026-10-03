import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CITIES, DEFAULT_CITY, type CityConfig } from "@/config/cities";
import { parseTripUrl, type SharedTrip } from "@/services/trip-tools";
interface CityState {
  city: CityConfig;
  setCity: (id: string) => void;
  incomingTrip: SharedTrip | null;
  clearIncomingTrip: () => void;
  sharedTripError: boolean;
  activityEnabled: boolean;
  setActivityEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}
const Context = createContext<CityState | null>(null);
export function CityProvider({ children }: { children: ReactNode }) {
  const [city, update] = useState(DEFAULT_CITY);
  const [incomingTrip, setIncomingTrip] = useState<SharedTrip | null>(null);
  const [sharedTripError, setSharedTripError] = useState(false);
  const [activityEnabled, setActivityEnabled] = useState(true);
  const clearIncomingTrip = useCallback(() => setIncomingTrip(null), []);
  const setCity = useCallback((id: string) => {
    const next = CITIES.find((c) => c.id === id);
    if (next) {
      update(next);
      setIncomingTrip(null);
      setSharedTripError(false);
    }
  }, []);
  useEffect(() => {
    const readTrip = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (!params.has("trip")) return;
      const trip = parseTripUrl(window.location.href);
      setSharedTripError(!trip);
      setIncomingTrip(trip);
      if (trip) update(CITIES.find((c) => c.id === trip.cityId)!);
      // Fragments are never sent to the server. Remove the consumed endpoints from this tab.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    };
    readTrip();
    window.addEventListener("hashchange", readTrip);
    return () => window.removeEventListener("hashchange", readTrip);
  }, []);
  return (
    <Context.Provider
      value={{
        city,
        setCity,
        incomingTrip,
        clearIncomingTrip,
        sharedTripError,
        activityEnabled,
        setActivityEnabled,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCity() {
  const value = useContext(Context);
  if (!value) throw new Error("CityProvider missing");
  return value;
}
