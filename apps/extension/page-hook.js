// page-hook.js — runs in the *page's main JS world* (not the extension's isolated
// world) so it can override window.fetch. Injected by content.js at document_start.
//
// When ChatGPT or Claude fires a chat-completion request, we:
//   1. capture the JSON request body (contains model + input messages),
//   2. tee the streaming response so the page keeps its untouched copy,
//   3. parse the SSE stream in the background, accumulating the assistant reply,
//   4. postMessage the raw text back to content.js for tokenization + storage.
//
// We never modify the request or response the page sees. If anything in here
// throws, we swallow it — better to lose a count than break someone's chat.

(() => {
  if (window.__HELIX_HOOK__) return;
  window.__HELIX_HOOK__ = true;

  const CHATGPT_URL = /^https:\/\/chatgpt\.com\/backend-api\/(f\/)?conversation(\?|$)/;
  // Broad Claude matcher — Anthropic changes their API paths often. We catch
  // any POST to claude.ai/api/ that mentions "completion" or looks like a
  // chat endpoint (append_message, messages, etc.). Payload sniffing below
  // decides whether it's a real chat request.
  const CLAUDE_URL_BROAD = /^https:\/\/claude\.ai\/api\//;
  const CLAUDE_CHAT_HINT = /(completion|append_message|messages|chat_conversation)/i;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const rawUrl = typeof input === "string" ? input : input?.url ?? "";
    // Sites (like claude.ai) call fetch with RELATIVE URLs. The browser
    // resolves them against the current origin before hitting the network,
    // but the string we see here is still relative. Normalize it so our
    // host-based regexes match consistently.
    let url = rawUrl;
    try {
      url = new URL(rawUrl, location.href).href;
    } catch {
      /* keep rawUrl */
    }
    const method = (init?.method ?? (typeof input !== "string" ? input?.method : "GET") ?? "GET").toUpperCase();

    const isChatGPT = CHATGPT_URL.test(url);
    const isClaudeReq = CLAUDE_URL_BROAD.test(url);

    if (method !== "POST" || (!isChatGPT && !isClaudeReq)) {
      return originalFetch(input, init);
    }

    // Snapshot the request body (before the fetch consumes it).
    let reqBody = null;
    try {
      const rawBody = init?.body ?? (typeof input !== "string" ? await input.clone().text() : null);
      if (rawBody) reqBody = JSON.parse(typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody));
    } catch {
      // Non-JSON body or unreadable — skip counting this call but let it through.
    }

    // For Claude, require BOTH: URL looks like a chat endpoint AND body has
    // a chat-shaped payload. This cleanly excludes /title, /notification,
    // /reflections/*, /event_logging/* even though they share the URL prefix.
    let isClaude = false;
    if (isClaudeReq) {
      const urlLooksLikeChat = CLAUDE_CHAT_HINT.test(url);
      const bodyLooksLikeChat = !!(
        reqBody && (
          typeof reqBody.prompt === "string" ||
          Array.isArray(reqBody.messages)
        )
      );
      isClaude = urlLooksLikeChat && bodyLooksLikeChat;
    }

    // If we decided this isn't a chat request, let it pass through untouched.
    if (!isChatGPT && !isClaude) {
      return originalFetch(input, init);
    }

    let res;
    try {
      res = await originalFetch(input, init);
    } catch (err) {
      throw err;
    }

    // Only handle streaming bodies (chat completions are all SSE).
    if (!res.body || !res.body.tee) return res;

    const source = isChatGPT ? "chatgpt" : "claude";
    const model = extractModel(source, reqBody);

    // Tell the orb a chat is starting — it will glow live from here.
    window.postMessage({ type: "HELIX_STREAM", event: "start", source, model }, "*");

    const [pageStream, ourStream] = res.body.tee();
    // Fire-and-forget: count in the background, never block the page.
    consumeStream(ourStream, source, reqBody, url).catch(() => {});

    // Return a fresh Response so the page reads its own untouched stream.
    return new Response(pageStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  async function consumeStream(stream, source, reqBody, url) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outText = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse whole SSE events; keep the trailing partial for next chunk.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          outText += extractDelta(source, evt);
        }

        // Keep the orb glowing while chunks are still arriving.
        window.postMessage({ type: "HELIX_STREAM", event: "bump" }, "*");
      }
      // Flush any trailing event.
      if (buffer) outText += extractDelta(source, buffer);
    } finally {
      // Always tell the orb the stream is done (even on abort/error).
      window.postMessage({ type: "HELIX_STREAM", event: "end" }, "*");
    }

    const model = extractModel(source, reqBody);
    const inputText = extractInput(source, reqBody);

    // Emit to content.js. It relays to the background service worker.
    const payload = {
      source,
      model,
      inputText,
      outputText: outText,
      ts: Date.now(),
      url,
    };
    console.log(
      `%c[helix]%c captured ${source} · model=${model} · in=${inputText.length}ch · out=${outText.length}ch`,
      "color:#06b6d4;font-weight:bold",
      "color:inherit",
    );
    window.postMessage({ type: "HELIX_USAGE", payload }, "*");
  }

  // ---------------------------------------------------------------------------
  // Per-site adapters. Small and isolated so we can patch each in one place.
  // ---------------------------------------------------------------------------

  function extractDelta(source, sseEvent) {
    // Each SSE event has one or more lines like "data: <json>" or "data: [DONE]".
    let out = "";
    for (const line of sseEvent.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (source === "chatgpt") {
          // Newer chatgpt.com stream shape: { message: { content: { parts: [...] } }, ... }
          // Older shape:               { delta: "..." }
          // Newest ("v" delta stream): { v: "..." } or nested paths under { p, o, v }
          if (typeof evt.delta === "string") out += evt.delta;
          else if (Array.isArray(evt?.message?.content?.parts)) {
            const parts = evt.message.content.parts.map((p) => (typeof p === "string" ? p : "")).join("");
            // The parts field is cumulative on ChatGPT — take the tail delta ourselves.
            out += parts.slice(out.length);
          } else if (typeof evt.v === "string") out += evt.v;
        } else if (source === "claude") {
          // Anthropic ships several SSE shapes across versions. Handle all:
          //   { type: "completion", completion: "..." }          (older)
          //   { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
          //   { type: "text_delta", text: "..." }                (variant)
          //   { delta: { text: "..." } }                         (loose)
          //   { text: "..." }                                    (very loose)
          if (typeof evt.completion === "string") out += evt.completion;
          else if (evt?.delta?.text) out += evt.delta.text;
          else if (evt?.delta?.type === "text_delta" && typeof evt?.delta?.text === "string") out += evt.delta.text;
          else if (evt?.type === "text_delta" && typeof evt?.text === "string") out += evt.text;
          else if (evt?.type === "content_block_delta" && typeof evt?.delta?.text === "string") out += evt.delta.text;
        }
      } catch {
        // Ignore malformed events.
      }
    }
    return out;
  }

  function extractModel(source, body) {
    if (!body) return "unknown";
    if (typeof body.model === "string") return body.model;
    return "unknown";
  }

  function extractInput(source, body) {
    if (!body) return "";
    if (source === "chatgpt") {
      const msgs = Array.isArray(body.messages) ? body.messages : [];
      return msgs
        .flatMap((m) => {
          if (!m) return [];
          if (typeof m.content === "string") return [m.content];
          const parts = m?.content?.parts;
          if (Array.isArray(parts)) return parts.filter((p) => typeof p === "string");
          return [];
        })
        .join("\n");
    }
    if (source === "claude") {
      if (typeof body.prompt === "string") return body.prompt;
      // Newer Claude payloads may use body.messages
      const msgs = Array.isArray(body.messages) ? body.messages : [];
      return msgs
        .flatMap((m) => {
          if (typeof m?.content === "string") return [m.content];
          if (Array.isArray(m?.content)) {
            return m.content
              .map((c) => (typeof c?.text === "string" ? c.text : ""))
              .filter(Boolean);
          }
          return [];
        })
        .join("\n");
    }
    return "";
  }

  // Visible in the page console at default log level.
  console.log("%c[helix]%c page-hook installed on " + location.host, "color:#06b6d4;font-weight:bold", "color:inherit");
})();
