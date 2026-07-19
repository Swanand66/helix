# Helix — privacy policy

_Last updated: 2026-07-19_

Helix is a browser extension that measures your token usage on chatgpt.com, claude.ai, gemini.google.com, and aistudio.google.com, and stores the counts locally in your browser. This document describes exactly what data is collected, where it goes, and what your options are.

## What we collect

For every chat message you send on any of the four supported sites (chatgpt.com, claude.ai, gemini.google.com, aistudio.google.com), Helix reads the outgoing request payload and the streamed response to compute:

- A model identifier (e.g. `gpt-4o`, `claude-5-sonnet`)
- The number of input tokens
- The number of output tokens
- The USD cost, based on our local pricing table
- A timestamp

Nothing else. We do **not** store:

- The content of your prompts
- The content of the model's replies
- Your account identity or session
- Any other page content

## Where the data goes

**Nowhere.** All of the above is written to `chrome.storage.local` — a per-browser sandbox that only Helix can read. No data is sent to us or to any third party.

## Network requests we make

Helix makes exactly one outbound network request:

- **Once every 24 hours**, we fetch a static JSON file from `https://raw.githubusercontent.com/Swanand66/helix_price/main/prices.json` to keep the model pricing table current.
- This is a plain HTTP GET request — no information about you or your usage is transmitted with it.

## Deleting your data

Any of the following will wipe all Helix data on your machine:

- **Click "Reset" in the Helix toolbar popup**
- **Uninstall the extension** — Chrome/Edge deletes the extension's storage automatically
- **Run in DevTools**: `chrome.storage.local.clear()`

## Third-party services

Helix does not use any analytics services, error trackers, or third-party APIs beyond the single pricing JSON fetch described above.

## Source code

Helix is fully open source under the MIT license. You can verify every claim in this document by reading the code at https://github.com/Swanand66/helix.

## Contact

For privacy questions or concerns, open an issue at https://github.com/Swanand66/helix/issues.
