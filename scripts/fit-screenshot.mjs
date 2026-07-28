#!/usr/bin/env node
// fit-screenshot.mjs — resize any image to the Chrome Web Store's
// required 1280×800 without stretching. Fits the source proportionally
// and pads any leftover space with a dark background that matches the
// Helix panel aesthetic (#0f172a). Output is guaranteed exact.
//
// Usage:
//   node scripts/fit-screenshot.mjs <input> [output]
//
// Examples:
//   node scripts/fit-screenshot.mjs shot.png
//   node scripts/fit-screenshot.mjs shot.png shot-1280x800.png

import sharp from "sharp";
import { basename, extname, join, dirname } from "node:path";

const [, , inputPath, outputPathArg] = process.argv;

if (!inputPath) {
  console.error("usage: node scripts/fit-screenshot.mjs <input> [output]");
  process.exit(1);
}

const W = 1280;
const H = 800;
const BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a — Helix panel dark

const base = basename(inputPath, extname(inputPath));
const outputPath =
  outputPathArg || join(dirname(inputPath), `${base}-1280x800.png`);

async function main() {
  const meta = await sharp(inputPath).metadata();
  console.log(`in : ${meta.width}×${meta.height} (${inputPath})`);

  await sharp(inputPath)
    .resize({
      width: W,
      height: H,
      fit: "contain",       // preserve aspect ratio
      background: BG,       // dark pad instead of white/transparent
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  const out = await sharp(outputPath).metadata();
  console.log(`out: ${out.width}×${out.height} (${outputPath})`);
  console.log("✓ ready to upload");
}

main().catch((err) => {
  console.error("fit-screenshot failed:", err);
  process.exit(1);
});
