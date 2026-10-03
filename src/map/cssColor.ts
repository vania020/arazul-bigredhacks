/** Reads a design-token color from CSS so map drawing never hard-codes hex values. */
export function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
