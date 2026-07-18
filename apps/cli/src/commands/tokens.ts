import { compare } from "helix-tokens";
import { c, usd } from "../ui/format.js";
import { renderCompareTable } from "../ui/table.js";

export interface TokensArgs {
  text: string;
  models?: string[];
  json?: boolean;
}

export function tokensCommand(args: TokensArgs): string {
  const rows = compare(args.text, args.models);

  if (args.json) {
    return JSON.stringify(
      {
        input: {
          chars: args.text.length,
          words: args.text.trim().split(/\s+/).filter(Boolean).length,
        },
        results: rows,
        cheapest: rows[0]?.model,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  const header = c.dim(
    `Input: ${args.text.trim().split(/\s+/).filter(Boolean).length} words, ${args.text.length} chars`,
  );
  const table = renderCompareTable(args.text, args.models);

  const cheapestPaid = rows.find((r) => r.usd > 0);
  const freeCount = rows.filter((r) => r.usd === 0).length;
  const summary = cheapestPaid
    ? c.dim(
        `${cheapestPaid.model} is the cheapest paid model — ${usd(cheapestPaid.usd)} for ${cheapestPaid.tokens} tokens` +
          (freeCount > 0 ? ` (${freeCount} local models are free)` : ""),
      )
    : "";

  const footer = c.dim("~ = local approximation (±3%). Add ANTHROPIC_API_KEY for exact.");

  return [header, table, summary, footer].filter(Boolean).join("\n");
}
