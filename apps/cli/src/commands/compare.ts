import { estimate } from "helix-tokens";
import { c, num, usd } from "../ui/format.js";

export interface CompareArgs {
  text: string;
  models: string[];
  outTokens?: number;
  json?: boolean;
}

export function compareCommand(args: CompareArgs): string {
  const maxOutput = args.outTokens ?? 500;

  const rows = args.models
    .map((model) => {
      const est = estimate({ input: args.text, model, maxOutput });
      return {
        model,
        inTokens: est.perRequest.inputTokens,
        outTokens: est.perRequest.outputTokens,
        usd: est.perRequest.usd,
        approx: est.approx,
      };
    })
    .sort((a, b) => a.usd - b.usd);

  if (args.json) return JSON.stringify(rows, null, 2);

  const lines: string[] = [];
  const width = 24;
  lines.push(
    c.bold(
      `${"Model".padEnd(width)}  In Tok   Out Tok   Cost         Rank`,
    ),
  );
  lines.push(c.dim("─".repeat(width + 40)));

  const medals = ["🥇 #1", "🥈 #2", "🥉 #3"];
  rows.forEach((row, i) => {
    const medal = medals[i] ?? `   #${i + 1}`;
    const approx = row.approx ? c.dim().yellow("~") : " ";
    const modelStr = i === 0 ? c.bold().green(row.model) : row.model;
    lines.push(
      `${modelStr.padEnd(width + (i === 0 ? c.bold().green(" ").length - 1 : 0))}  ${String(num(row.inTokens)).padStart(6)}${approx}  ${String(num(row.outTokens)).padStart(6)}   ${usd(row.usd).padEnd(10)}   ${medal}`,
    );
  });

  if (rows.length >= 2) {
    const cheapest = rows[0]!;
    const priciest = rows[rows.length - 1]!;
    const ratio = priciest.usd / cheapest.usd;
    if (Number.isFinite(ratio) && ratio > 1.1) {
      lines.push("");
      lines.push(
        c.dim(
          `💡 ${cheapest.model} is ${ratio.toFixed(1)}× cheaper than ${priciest.model} for this workload.`,
        ),
      );
    }
  }

  return lines.join("\n");
}
