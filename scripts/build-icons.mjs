#!/usr/bin/env node
// build-icons.mjs — generate Chrome Web Store required icons (16, 48, 128 px)
// from the ⌘ helix logo. Writes to apps/extension/icons/.
//
// Design: solid dark rounded square background + white ⌘ glyph. High contrast
// so the icon reads well in the Chrome toolbar and in the store listing.

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO = join(dirname(__filename), "..");
const OUT = join(REPO, "apps/extension/icons");
mkdirSync(OUT, { recursive: true });

const SIZES = [16, 48, 128];

function makeSvg(size) {
  // Stroke widths scale gently with size for legibility.
  const stroke = size <= 16 ? 2.6 : size <= 48 ? 2.2 : 2.0;
  const radius = size <= 16 ? 3 : size <= 48 ? 10 : 24;
  const pad = size * 0.22;
  const glyphSize = size - pad * 2;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <g transform="translate(${pad}, ${pad}) scale(${glyphSize / 24})">
    <path
      d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"
      fill="none"
      stroke="#06b6d4"
      stroke-width="${stroke}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>`;
}

async function build() {
  for (const size of SIZES) {
    const svg = makeSvg(size);
    const outPath = join(OUT, `icon-${size}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`  ✓ ${outPath} (${size}×${size})`);
  }
  console.log(`\nWrote ${SIZES.length} icons to ${OUT}`);
}

build().catch((err) => {
  console.error("build-icons failed:", err);
  process.exit(1);
});
