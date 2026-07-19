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
  // Gemini. Two surfaces:
  //   • gemini.google.com — consumer app, uses BardFrontendService (obscure
  //     batchexecute RPC format). We still catch these POSTs but response
  //     parsing is limited; token counts are estimates from URL/body only.
  //   • aistudio.google.com + generativelanguage.googleapis.com — cleaner
  //     REST + streamGenerateContent JSON. Full parsing works there.
  const GEMINI_URL_BROAD = /^https:\/\/(gemini\.google\.com|aistudio\.google\.com|generativelanguage\.googleapis\.com)\//;
  const GEMINI_CHAT_HINT = /(generateContent|streamGenerateContent|assistant\.lamda|BardChatUi|BardFrontendService|StreamGenerate)/i;

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
    const isGeminiReq = GEMINI_URL_BROAD.test(url);

    if (method !== "POST" || (!isChatGPT && !isClaudeReq && !isGeminiReq)) {
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

    // For Gemini via fetch (AI Studio + REST API): standard shape
    //   { contents: [{ role, parts: [{ text }] }], model, ... }.
    // The consumer Gemini app (gemini.google.com) does NOT use fetch — it
    // uses XHR and is handled by the XHR interceptor further down.
    let isGemini = false;
    if (isGeminiReq && !url.includes("gemini.google.com")) {
      const urlLooksLikeChat = GEMINI_CHAT_HINT.test(url);
      const bodyLooksLikeChat = !!(
        reqBody && (
          Array.isArray(reqBody.contents) ||
          Array.isArray(reqBody.messages) ||
          typeof reqBody.prompt === "string"
        )
      );
      isGemini = urlLooksLikeChat && bodyLooksLikeChat;
    }

    // If we decided this isn't a chat request, let it pass through untouched.
    if (!isChatGPT && !isClaude && !isGemini) {
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

    const source = isChatGPT ? "chatgpt" : isClaude ? "claude" : "gemini";
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
        } else if (source === "gemini") {
          // AI Studio / REST API: standard shape.
          //   { candidates: [{ content: { parts: [{ text: "..." }] } }] }
          const cands = evt?.candidates;
          if (Array.isArray(cands)) {
            for (const c of cands) {
              const parts = c?.content?.parts;
              if (Array.isArray(parts)) {
                for (const p of parts) if (typeof p?.text === "string") out += p.text;
              }
            }
          }
          // Streaming delta variant.
          if (typeof evt?.text === "string") out += evt.text;
        }
      } catch {
        // Ignore malformed events.
      }
    }
    return out;
  }

  function extractModel(source, body) {
    if (!body) return source === "gemini" ? "gemini-2.5-pro" : "unknown";
    if (typeof body.model === "string") return body.model;
    // Gemini REST puts the model in the URL, not the body — caller fills it
    // in from the URL when body.model is absent. Give a sensible default.
    if (source === "gemini") return "gemini-2.5-pro";
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
    if (source === "gemini") {
      // AI Studio / REST: { contents: [{ role, parts: [{ text }] }] }
      if (Array.isArray(body.contents)) {
        return body.contents
          .flatMap((c) => Array.isArray(c?.parts) ? c.parts : [])
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n");
      }
      // Simpler variant: { prompt: "..." }
      if (typeof body.prompt === "string") return body.prompt;
      // Loose fallback: { messages: [...] }
      if (Array.isArray(body.messages)) {
        return body.messages
          .flatMap((m) => (typeof m?.content === "string" ? [m.content] : []))
          .join("\n");
      }
    }
    return "";
  }

  // ===========================================================================
  // Gemini web (gemini.google.com) uses XMLHttpRequest, not fetch, for its
  // chat completion. All chat traffic goes to /_/BardChatUi/data/batchexecute
  // — a proprietary Google internal RPC endpoint. The body is form-encoded
  // (`f.req=...&at=...&_reqid=...`) with a URL-encoded JSON blob inside.
  // The response starts with `)]}'` and contains nested JSON arrays with
  // the assistant's reply strings embedded.
  //
  // We intercept XHR.send, filter to chat-shaped requests, and extract
  // rough token counts from the response text.
  // ===========================================================================

  const IS_GEMINI_PAGE =
    location.host.includes("gemini.google.com") ||
    location.host.includes("aistudio.google.com");

  const BARD_BATCHEXECUTE = "/_/BardChatUi/data/batchexecute";
  const MIN_CHAT_BODY_BYTES = 500; // filter out ping/telemetry ops
  // "Send message and get response" RPC ids. Anything not in this list
  // (conversation list, history load, title generation, telemetry, etc.)
  // uses the same batchexecute URL but with a different rpcids param, and
  // MUST be skipped so refreshing a chat doesn't re-count old tokens.
  // If Google renames the send-message RPC, add its new id here.
  const GEMINI_CHAT_RPCIDS = ["ESY5D", "SNlM0e"];
  // Guard against tracking the same logical send twice (Gemini sometimes
  // retries or emits a follow-up call).
  const DEDUP_WINDOW_MS = 1500;
  let lastGeminiTrackMs = 0;

  function isGeminiChatSendUrl(url) {
    if (!url.includes(BARD_BATCHEXECUTE)) return false;
    // rpcids can be a single id or a comma-separated list.
    const m = url.match(/[?&]rpcids=([^&]+)/);
    if (!m) return false;
    const ids = decodeURIComponent(m[1]).split(",");
    return ids.some((id) => GEMINI_CHAT_RPCIDS.includes(id));
  }

  if (IS_GEMINI_PAGE) {
    try {
      const OriginalXHR = window.XMLHttpRequest;
      function HelixXHR() {
        const xhr = new OriginalXHR();
        const state = { url: "", method: "", body: null, bodyLen: 0 };

        const origOpen = xhr.open;
        xhr.open = function (m, u, ...rest) {
          state.method = String(m || "").toUpperCase();
          state.url = String(u || "");
          return origOpen.call(this, m, u, ...rest);
        };

        const origSend = xhr.send;
        xhr.send = function (body) {
          state.body = body;
          state.bodyLen = typeof body === "string" ? body.length : 0;

          const now = Date.now();
          const isChatXhr =
            state.method === "POST" &&
            isGeminiChatSendUrl(state.url) &&
            state.bodyLen >= MIN_CHAT_BODY_BYTES &&
            now - lastGeminiTrackMs > DEDUP_WINDOW_MS;

          if (isChatXhr) {
            lastGeminiTrackMs = now;
            const model = detectGeminiModel();
            window.postMessage(
              { type: "HELIX_STREAM", event: "start", source: "gemini", model },
              "*",
            );

            xhr.addEventListener("loadend", () => {
              const outText = extractGeminiOutput(xhr.responseText || "");
              const inputText = extractGeminiInput(state.body);
              console.log(
                "%c[helix]%c captured gemini · model=%s · in=%dch · out=%dch",
                "color:#06b6d4;font-weight:bold",
                "color:inherit",
                model,
                inputText.length,
                outText.length,
              );
              window.postMessage(
                {
                  type: "HELIX_USAGE",
                  payload: {
                    source: "gemini",
                    model,
                    inputText,
                    outputText: outText,
                    ts: Date.now(),
                    url: state.url,
                  },
                },
                "*",
              );
              window.postMessage({ type: "HELIX_STREAM", event: "end" }, "*");
            });

            xhr.addEventListener("progress", () => {
              window.postMessage({ type: "HELIX_STREAM", event: "bump" }, "*");
            });
          }

          return origSend.call(this, body);
        };
        return xhr;
      }
      HelixXHR.prototype = OriginalXHR.prototype;
      window.XMLHttpRequest = HelixXHR;
    } catch (e) {
      console.warn("[helix] XHR override failed:", e);
    }
  }

  /** Detect which Gemini model is selected from the model-picker button in
   *  the DOM. Falls back to gemini-2.5-pro. Small + selector-tolerant. */
  function detectGeminiModel() {
    try {
      const text = (document.body?.innerText || "").toLowerCase();
      // The visible label in the composer's model dropdown is a strong signal.
      // Look for common tokens; ordering matters (specific first).
      if (/flash[- ]?lite/.test(text)) return "gemini-2.5-flash";
      if (/\bflash\b/.test(text))     return "gemini-2.5-flash";
      if (/\bpro\b/.test(text))       return "gemini-2.5-pro";
    } catch {}
    return "gemini-2.5-pro";
  }

  /** Pull the user's prompt out of Gemini's form-encoded XHR body.
   *  Body shape: `f.req=<url-encoded JSON>&at=...`. The JSON is a nested
   *  array; the user message lives as a plain string somewhere near the top.
   *  We take a rough approach: url-decode f.req and scan for long quoted
   *  strings. Good enough for token estimation. */
  function extractGeminiInput(body) {
    if (typeof body !== "string") return "";
    try {
      const m = body.match(/(?:^|&)f\.req=([^&]+)/);
      if (!m) return "";
      const decoded = decodeURIComponent(m[1]);
      // Look for the first significant quoted string (user prompt is usually
      // the longest at the start of the payload).
      const strings = (decoded.match(/"([^"\\]{4,}(?:\\.[^"\\]*)*)"/g) || [])
        .map((s) => JSON.parse(s))
        .filter((s) => typeof s === "string" && /\s/.test(s));
      return strings.slice(0, 3).join("\n"); // first few, likely prompt + attachments
    } catch {
      return "";
    }
  }

  /** Extract assistant text from a Gemini batchexecute response. The response
   *  starts with `)]}'` then contains one or more chunks like:
   *    N
   *    [["wrb.fr","<rpcid>","<escaped JSON string>", ...], ...]
   *  The inner string contains the assistant reply nested deep. We do a two-
   *  pass regex extraction — good approximation for token counting purposes. */
  function extractGeminiOutput(responseText) {
    if (!responseText) return "";
    try {
      // Strip the anti-XSSI prefix.
      const cleaned = responseText.replace(/^\)\]}'\s*/, "");
      // Grab every long-enough quoted string, unescape it, and keep the
      // ones that look like natural language (contain spaces, are not URLs
      // or Google-internal tokens).
      const raw = cleaned.match(/"([^"\\]{25,}(?:\\.[^"\\]*)*)"/g) || [];
      const texts = raw
        .map((s) => {
          try { return JSON.parse(s); } catch { return null; }
        })
        .filter(
          (t) =>
            typeof t === "string" &&
            /\s/.test(t) &&
            !t.startsWith("http") &&
            !t.startsWith("boq_") &&
            !t.startsWith("data:") &&
            !/^[A-Za-z0-9+/=_-]{40,}$/.test(t),
        );
      return texts.join("\n");
    } catch {
      return "";
    }
  }

  // Visible in the page console at default log level.
  console.log(
    "%c[helix]%c page-hook installed on " + location.host,
    "color:#06b6d4;font-weight:bold",
    "color:inherit",
  );
})();
