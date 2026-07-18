import { priceOf } from "@helix-tokens/prices";
import { inputCost, outputCost } from "helix-tokens";
import { c, num, usd } from "../ui/format.js";

export interface CostArgs {
  model: string;
  n: number;
  inTokens: number;
  outTokens: number;
  json?: boolean;
}

export function costCommand(args: CostArgs): string {
  const info = priceOf(args.model);
  if (!info) {
    throw new Error(`Unknown model: ${args.model}`);
  }

  const perReqInputUsd = inputCost(args.inTokens, args.model);
  const perReqOutputUsd = outputCost(args.outTokens, args.model);
  const perReqUsd = perReqInputUsd + perReqOutputUsd;
  const totalUsd = perReqUsd * args.n;

  const rps = 10;
  const wallSec = args.n / rps;
  const wallStr =
    wallSec < 60
      ? `${Math.ceil(wallSec)}s`
      : wallSec < 3600
        ? `${Math.round(wallSec / 60)}m`
        : `${Math.floor(wallSec / 3600)}h ${Math.round((wallSec % 3600) / 60)}m`;

  if (args.json) {
    return JSON.stringify(
      {
        model: args.model,
        n: args.n,
        inTokens: args.inTokens,
        outTokens: args.outTokens,
        perRequest: {
          input: perReqInputUsd,
          output: perReqOutputUsd,
          total: perReqUsd,
        },
        total: totalUsd,
        wallTime: wallStr,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(c.bold(`Batch estimate: ${args.model} × ${num(args.n)} requests`));
  lines.push(c.dim("─".repeat(48)));
  lines.push(
    `Input:  ${num(args.inTokens)} tok × ${num(args.n)} = ${num(args.inTokens * args.n)} tok  →  ${usd(perReqInputUsd * args.n)}`,
  );
  lines.push(
    `Output: ${num(args.outTokens)} tok × ${num(args.n)} = ${num(args.outTokens * args.n)} tok  →  ${usd(perReqOutputUsd * args.n)}`,
  );
  lines.push(c.dim("─".repeat(48)));
  lines.push(c.bold(`Total: ${usd(totalUsd)}`));
  lines.push(c.dim(`Wall time (at ${rps} rps): ~${wallStr}`));

  return lines.join("\n");
}
