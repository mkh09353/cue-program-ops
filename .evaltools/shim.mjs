// Anthropic /v1/messages -> OpenAI chat-completions shim for OpenCode Zen,
// with passthrough to xAI for grok models. Handles deepseek reasoning_content round-trip.
import http from "node:http";
import crypto from "node:crypto";

const ZEN_URL = "https://opencode.ai/zen/v1/chat/completions";
const ZEN_KEY = process.env.ZEN_KEY;
const XAI_URL = "https://api.x.ai/v1/messages";
const XAI_KEY = process.env.XAI_KEY;
const SESSION_ID = crypto.randomUUID();

const flat = (c) => {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b.type === "text" ? b.text : b.type === "image" ? "[image omitted]" : "")).join("\n");
  return String(c ?? "");
};

function toOpenAI(body) {
  const out = [];
  if (body.system) out.push({ role: "system", content: flat(body.system) });
  for (const m of body.messages ?? []) {
    if (m.role === "assistant") {
      const msg = { role: "assistant", content: null };
      let text = "";
      const calls = [];
      for (const b of Array.isArray(m.content) ? m.content : [{ type: "text", text: flat(m.content) }]) {
        if (b.type === "text") text += b.text;
        else if (b.type === "thinking" && b.thinking) msg.reasoning_content = b.thinking;
        else if (b.type === "tool_use") calls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
      }
      if (text) msg.content = text;
      if (calls.length) msg.tool_calls = calls;
      if (!msg.reasoning_content) msg.reasoning_content = " ";
      out.push(msg);
    } else {
      const blocks = Array.isArray(m.content) ? m.content : [{ type: "text", text: flat(m.content) }];
      let userText = "";
      for (const b of blocks) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: flat(b.content) || (b.is_error ? "error" : "ok") });
        else if (b.type === "text") userText += b.text;
        else if (b.type === "image") userText += "\n[image omitted]";
      }
      if (userText) out.push({ role: "user", content: userText });
    }
  }
  const req = { model: body.model, messages: out, max_tokens: body.max_tokens };
  if (process.env.SHIM_REASONING_EFFORT) req.reasoning_effort = process.env.SHIM_REASONING_EFFORT;
  if (body.temperature !== undefined) req.temperature = body.temperature;
  if (Array.isArray(body.tools) && body.tools.length)
    req.tools = body.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } } }));
  return req;
}

function toAnthropic(resp, model) {
  const ch = resp.choices?.[0] ?? {};
  const msg = ch.message ?? {};
  const content = [];
  if (msg.reasoning_content) content.push({ type: "thinking", thinking: msg.reasoning_content, signature: "" });
  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const tc of msg.tool_calls ?? []) {
    let input = {};
    try { input = JSON.parse(tc.function?.arguments || "{}"); } catch {}
    content.push({ type: "tool_use", id: tc.id || "call_" + crypto.randomUUID().slice(0, 8), name: tc.function?.name, input });
  }
  const fr = ch.finish_reason;
  return {
    id: resp.id || "shim_" + crypto.randomUUID().slice(0, 8),
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: fr === "tool_calls" ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: resp.usage?.prompt_tokens ?? 0, output_tokens: resp.usage?.completion_tokens ?? 0 },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
    res.writeHead(req.url === "/health" ? 200 : 404).end(req.url === "/health" ? "ok" : "not found");
    return;
  }
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", async () => {
    try {
      const body = JSON.parse(raw);
      if (String(body.model).startsWith("grok")) {
        const r = await fetch(XAI_URL, {
          method: "POST",
          headers: { "x-api-key": XAI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: raw,
        });
        res.writeHead(r.status, { "content-type": "application/json" }).end(await r.text());
        return;
      }
      const oaReq = toOpenAI(body);
      let lastErr = "";
      for (let attempt = 0; attempt < 7; attempt++) {
        const r = await fetch(ZEN_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + ZEN_KEY,
            "content-type": "application/json",
            "X-Session-Id": SESSION_ID,
            "x-session-affinity": SESSION_ID,
          },
          body: JSON.stringify(oaReq),
        });
        const text = await r.text();
        if (r.status === 429 || r.status >= 500) {
          lastErr = `upstream ${r.status}: ${text.slice(0, 300)}`;
          await new Promise((s) => setTimeout(s, Math.min(60000, 4000 * 2 ** attempt)));
          continue;
        }
        if (!r.ok) {
          res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: text.slice(0, 800) } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(toAnthropic(JSON.parse(text), body.model)));
        return;
      }
      res.writeHead(529, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: lastErr } }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "api_error", message: String(e).slice(0, 500) } }));
    }
  });
});
server.listen(4545, "127.0.0.1", () => console.log("shim ready on 4545"));
