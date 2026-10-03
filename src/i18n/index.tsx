import { createContext, useContext, useState, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { pt } from "./pt";
import { es } from "./es";

export type Lang = "en" | "pt" | "es";
const dicts: Record<Lang, Dict> = { en, pt, es };
export type TKey = keyof Dict;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey, vars?: Record<string, string | number>) => string;
}
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = (k: TKey, vars?: Record<string, string | number>) => {
    let s = dicts[lang][k] ?? en[k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b));
    return s;
  };
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
