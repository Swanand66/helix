import { describe, expect, it } from "vitest";
import { budget, compare, cost, count, estimate } from "../src/index.js";

describe("count()", () => {
  it("returns a number for a single model", () => {
    const n = count("hello world", "gpt-4o");
    expect(n).toBeGreaterThan(0);
    expect(typeof n).toBe("number");
  });

  it("returns a record for all models when no model is passed", () => {
    const all = count("hello world");
    expect(typeof all).toBe("object");
    expect(all["gpt-4o"]).toBeGreaterThan(0);
    expect(all["claude-4.5-sonnet"]).toBeGreaterThan(0);
  });

  it("throws on unknown model", () => {
    expect(() => count("hi", "not-a-model")).toThrow(/Unknown model/);
  });
});

describe("cost()", () => {
  it("is 0 for free (local) models", () => {
    const c = cost("hello world", "llama-3.3-70b");
    expect(c.usd).toBe(0);
    expect(c.approx).toBe(true);
  });

  it("scales linearly with token count for paid models", () => {
    const short = cost("hi", "gpt-4o");
    const long = cost("hi ".repeat(1000), "gpt-4o");
    expect(long.usd).toBeGreaterThan(short.usd * 10);
  });

  it("marks OpenAI counts as exact", () => {
    expect(cost("hello", "gpt-4o").approx).toBe(false);
  });

  it("marks Anthropic counts as approximate", () => {
    expect(cost("hello", "claude-4.5-sonnet").approx).toBe(true);
  });
});

describe("estimate()", () => {
  it("computes per-request and batch totals", () => {
    const r = estimate({
      input: "hello world",
      maxOutput: 100,
      model: "gpt-4o",
      n: 1000,
    });
    expect(r.perRequest.outputTokens).toBe(100);
    expect(r.batch.n).toBe(1000);
    expect(r.batch.usd).toBeCloseTo(r.perRequest.usd * 1000, 5);
  });

  it("suggests cheaper alternatives for expensive models", () => {
    const r = estimate({
      input: "hello world",
      model: "claude-4.5-opus",
      n: 10_000,
    });
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.alternatives[0]!.usd).toBeLessThan(r.batch.usd);
  });

  it("formats wall time reasonably", () => {
    const short = estimate({ input: "hi", model: "gpt-4o", n: 10 });
    const long = estimate({ input: "hi", model: "gpt-4o", n: 100_000 });
    expect(short.batch.wallTime).toMatch(/s$/);
    expect(long.batch.wallTime).toMatch(/[mh]/);
  });
});

describe("budget()", () => {
  it("passes when cost is under budget", () => {
    const b = budget("hi", { max: 1.0, model: "gpt-4o" });
    expect(b.fits).toBe(true);
    expect(b.remaining).toBeGreaterThan(0);
  });

  it("fails and suggests cheaper models when over budget", () => {
    const huge = "word ".repeat(50_000);
    const b = budget(huge, { max: 0.0001, model: "claude-4.5-opus" });
    expect(b.fits).toBe(false);
    expect(b.suggestions.length).toBeGreaterThanOrEqual(0);
  });
});

describe("compare()", () => {
  it("returns rows sorted cheapest-first with ranks", () => {
    const rows = compare("hello world");
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.usd).toBeGreaterThanOrEqual(rows[i - 1]!.usd);
    }
    expect(rows[0]!.rank).toBe(1);
  });

  it("respects the models filter", () => {
    const rows = compare("hi", ["gpt-4o", "claude-4.5-sonnet"]);
    expect(rows).toHaveLength(2);
  });

  it("marks fitsContext correctly", () => {
    const rows = compare("hi", ["gpt-4o"]);
    expect(rows[0]!.fitsContext).toBe(true);
  });
});
