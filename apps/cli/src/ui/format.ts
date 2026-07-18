import kleur from "kleur";

/** Format a USD amount with sensible precision. */
export function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toFixed(7)}`;
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(0)}`;
}

/** Format an integer with thousands separators. */
export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** Approximation marker (a dim tilde). */
export function approxMark(approx: boolean): string {
  return approx ? kleur.dim().yellow("~") : " ";
}

/** Cheapest badge (green star). */
export function starBadge(): string {
  return kleur.green("★");
}

export const c = kleur;
