#!/usr/bin/env node
// package.mjs — build the Chrome Web Store submission zip.
//
// Zips apps/extension/ (only the files Chrome actually needs) into
// dist/helix-vX.Y.Z.zip. Version comes from manifest.json.
//
// No external deps: uses Node's built-in zlib via a tiny hand-rolled
// ZIP writer for portability. Everything runs from `node scripts/package.mjs`.

import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const REPO = join(dirname(__filename), "..");
const SRC  = join(REPO, "apps/extension");
const DIST = join(REPO, "dist");
mkdirSync(DIST, { recursive: true });

// What we ship. Anything not listed here is excluded — no README, no
// package.json, no dev-only artifacts.
const INCLUDE = [
  "manifest.json",
  "background.js",
  "content.js",
  "orb-inject.js",
  "page-hook.js",
  "popup.html",
  "popup.js",
  "tokenize.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

// -----------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
const version = manifest.version;
const outPath = join(DIST, `helix-v${version}.zip`);

// -----------------------------------------------------------------------------
// Tiny ZIP writer (stored + deflate). Enough for Chrome extension packaging.
// -----------------------------------------------------------------------------

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const dosTime = (() => {
    const d = new Date();
    return {
      time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f),
      date: (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f),
    };
  })();

  for (const { name, data } of files) {
    const nameBuf  = Buffer.from(name, "utf8");
    const uncomp   = data;
    const comp     = deflateRawSync(uncomp, { level: 9 });
    const useComp  = comp.length < uncomp.length;
    const payload  = useComp ? comp : uncomp;
    const method   = useComp ? 8 : 0;
    const crc      = crc32(uncomp);
    const csize    = payload.length;
    const usize    = uncomp.length;

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(method),
      u16(dosTime.time),
      u16(dosTime.date),
      u32(crc),
      u32(csize),
      u32(usize),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
    ]);
    localParts.push(localHeader, payload);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(method),
      u16(dosTime.time),
      u16(dosTime.date),
      u32(crc),
      u32(csize),
      u32(usize),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
  }

  const centralDir     = Buffer.concat(centralParts);
  const centralOffset  = offset;
  const centralSize    = centralDir.length;

  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

// -----------------------------------------------------------------------------

const files = INCLUDE.map((rel) => {
  const abs = join(SRC, rel);
  return {
    name: rel.split(sep).join("/"),
    data: readFileSync(abs),
  };
});

const zip = makeZip(files);
writeFileSync(outPath, zip);

const kb = (n) => (n / 1024).toFixed(1) + " KB";

console.log(`\nHelix Chrome Web Store package built:\n`);
console.log(`  file    : ${relative(REPO, outPath)}`);
console.log(`  version : ${version}`);
console.log(`  entries : ${files.length}`);
console.log(`  size    : ${kb(zip.length)}\n`);
console.log(`  contents:`);
for (const f of files) console.log(`    · ${f.name.padEnd(24)}  ${kb(f.data.length)}`);
console.log(`\nUpload ${relative(REPO, outPath)} at:`);
console.log(`  https://chrome.google.com/webstore/devconsole\n`);
