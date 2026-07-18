import { fstatSync, readFileSync } from "node:fs";
import mri from "mri";
import { budgetCommand } from "./commands/budget.js";
import { compareCommand } from "./commands/compare.js";
import { costCommand } from "./commands/cost.js";
import { pricesCommand } from "./commands/prices.js";
import { tokensCommand } from "./commands/tokens.js";
import { c } from "./ui/format.js";

const HELP = `
${c.bold("helix-tokens")} — count tokens and estimate cost for every major LLM

${c.bold("Usage")}
  helix-tokens "<text>"                    Count across all models
  helix-tokens --file <path>               Read input from a file
  cat prompt.md | helix-tokens             Read from stdin
  helix-tokens compare "<text>" --models gpt-4o,claude-4.5-sonnet
  helix-tokens cost <model> --n 10000 --in 800 --out 400
  helix-tokens budget "<text>" --model gpt-4o --max 0.01
  helix-tokens prices                      Current rate card

${c.bold("Global flags")}
  --json                Machine-readable output
  --models m1,m2        Restrict to specific models (default: all)
  --file <path>         Read text from a file
  -h, --help            Show this help
`;

/**
 * Read stdin only if it's actually a pipe or redirected file.
 *
 * `process.stdin.isTTY` is `true` for a terminal or `undefined` otherwise —
 * it is never `false`, so we can't distinguish "piped" from "not attached"
 * with that alone. Blindly calling `readFileSync(0)` in the latter case hangs
 * forever (e.g. when the CLI is invoked from a script that doesn't feed stdin).
 * Checking the file descriptor's stat lets us bail out safely.
 */
function readStdinIfPiped(): string {
  try {
    const stat = fstatSync(0);
    if (!stat.isFIFO() && !stat.isFile()) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseModels(v: unknown): string[] | undefined {
  if (typeof v !== "string") return undefined;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const argv = mri(process.argv.slice(2), {
    boolean: ["json", "help"],
    alias: { h: "help", f: "file" },
    string: ["models", "file", "model", "max", "n", "in", "out"],
  });

  if (argv.help) {
    console.log(HELP);
    return;
  }

  const [subOrText, ...rest] = argv._ as string[];
  const subcommands = new Set(["compare", "cost", "budget", "prices"]);

  // Resolve input text: --file wins, then positional args, then stdin (only if piped).
  // Stdin is read lazily so we never block when no data is being fed in.
  const fileText = argv.file ? readFileSync(argv.file as string, "utf8") : "";
  const positionalText =
    subOrText && !subcommands.has(subOrText) ? [subOrText, ...rest].join(" ") : rest.join(" ");

  const text = fileText || positionalText || readStdinIfPiped();

  // Route.
  if (subOrText === "prices") {
    console.log(pricesCommand({ json: !!argv.json }));
    return;
  }

  if (subOrText === "cost") {
    const model = (rest[0] ?? argv.model) as string | undefined;
    if (!model) {
      console.error(c.red("Error: cost requires a model, e.g. `helix-tokens cost gpt-4o --n 10000 --in 800 --out 400`"));
      process.exit(1);
    }
    console.log(
      costCommand({
        model,
        n: Number(argv.n ?? 1),
        inTokens: Number(argv.in ?? 500),
        outTokens: Number(argv.out ?? 300),
        json: !!argv.json,
      }),
    );
    return;
  }

  if (subOrText === "compare") {
    if (!text) {
      console.error(c.red("Error: compare requires text (positional, --file, or stdin)."));
      process.exit(1);
    }
    const models = parseModels(argv.models);
    if (!models || models.length < 2) {
      console.error(c.red("Error: compare requires --models m1,m2[,m3]"));
      process.exit(1);
    }
    console.log(
      compareCommand({
        text,
        models,
        outTokens: argv.out ? Number(argv.out) : undefined,
        json: !!argv.json,
      }),
    );
    return;
  }

  if (subOrText === "budget") {
    if (!text) {
      console.error(c.red("Error: budget requires text (positional, --file, or stdin)."));
      process.exit(1);
    }
    const model = (argv.model as string | undefined) ?? "gpt-4o";
    const max = Number(argv.max ?? 0.01);
    console.log(budgetCommand({ text, model, max, json: !!argv.json }));
    return;
  }

  // Default: `helix-tokens "<text>"` — count across all models.
  if (!text) {
    console.log(HELP);
    return;
  }

  console.log(
    tokensCommand({
      text,
      models: parseModels(argv.models),
      json: !!argv.json,
    }),
  );
}

main().catch((err) => {
  console.error(c.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
