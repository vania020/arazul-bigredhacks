import { createContext, useContext, useState, type ReactNode } from "react";
import { CITIES, DEFAULT_CITY, type CityConfig } from "@/config/cities";
const Context = createContext<{ city: CityConfig; setCity: (id: string) => void } | null>(null);
export function CityProvider({ children }: { children: ReactNode }) {
  const [city, update] = useState(DEFAULT_CITY);
  const setCity = (id: string) => {
    const next = CITIES.find((c) => c.id === id);
    if (next) update(next);
  };
  return <Context.Provider value={{ city, setCity }}>{children}</Context.Provider>;
}
export function useCity() {
  const value = useContext(Context);
  if (!value) throw new Error("CityProvider missing");
  return value;
}
