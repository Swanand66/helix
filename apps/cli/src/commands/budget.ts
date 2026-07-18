import { budget } from "helix-tokens";
import { c, num, usd } from "../ui/format.js";

export interface BudgetArgs {
  text: string;
  model: string;
  max: number;
  json?: boolean;
}

export function budgetCommand(args: BudgetArgs): string {
  const r = budget(args.text, { max: args.max, model: args.model });

  if (args.json) return JSON.stringify(r, null, 2);

  const lines: string[] = [];
  if (r.fits) {
    lines.push(c.bold().green("✓ FITS"));
    lines.push(c.dim("─".repeat(32)));
    lines.push(`Model:     ${r.model}`);
    lines.push(`Tokens:    ${num(r.tokens)}${r.approx ? c.dim().yellow(" ~") : ""}`);
    lines.push(`Cost:      ${usd(r.spent)}`);
    lines.push(`Budget:    ${usd(r.budget)}`);
    lines.push(
      `Remaining: ${usd(r.remaining)} ${c.dim(`(${Math.round((r.remaining / r.budget) * 100)}%)`)}`,
    );
  } else {
    lines.push(c.bold().red("✗ EXCEEDS BUDGET"));
    lines.push(c.dim("─".repeat(32)));
    lines.push(`Model:     ${r.model}`);
    lines.push(`Tokens:    ${num(r.tokens)}${r.approx ? c.dim().yellow(" ~") : ""}`);
    lines.push(`Cost:      ${usd(r.spent)}`);
    lines.push(`Budget:    ${usd(r.budget)}`);
    lines.push(
      `Over by:   ${usd(r.spent - r.budget)} ${c.dim(`(${Math.round(((r.spent - r.budget) / r.budget) * 100)}%)`)}`,
    );

    if (r.suggestions.length > 0) {
      lines.push("");
      lines.push(c.dim("Alternatives that fit:"));
      for (const s of r.suggestions) {
        lines.push(`  ${s.model.padEnd(24)} ${usd(s.usd).padStart(12)}`);
      }
    }
  }

  return lines.join("\n");
}
