#!/usr/bin/env node
/**
 * Serves the settings UI + REST API for read/save ~/.claude/settings.json,
 * named profiles, model discovery, and connectivity tests.
 * Binds to 127.0.0.1 only.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../web/settings-configurator");

function getClaudeDir() {
  const fromEnv = process.env.CLAUDE_CONFIG_DIR;
  if (fromEnv) return path.normalize(fromEnv);
  return path.join(os.homedir(), ".claude");
}

function getUserSettingsPath() {
  return path.join(getClaudeDir(), "settings.json");
}

function getProfilesPath() {
  return path.join(getClaudeDir(), "wellbin-model-profiles.json");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function isPathInsideRoot(rootDir, candidate) {
  const rel = path.relative(rootDir, candidate);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function maskKey(key) {
  if (!key || typeof key !== "string") return "";
  if (key.length <= 6) return "******";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    if (e && e.code === "ENOENT") return fallback;
    throw e;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function extractFormFromSettings(settings) {
  const env = settings?.env && typeof settings.env === "object" ? settings.env : {};
  const modelType = settings?.modelType === "openai" ? "openai" : "anthropic";
  if (modelType === "openai") {
    return {
      modelType: "openai",
      baseUrl: String(env.OPENAI_BASE_URL ?? ""),
      apiKey: String(env.OPENAI_API_KEY ?? ""),
      haikuModel: String(env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? ""),
      sonnetModel: String(env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ""),
      opusModel: String(env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? ""),
      maxConcurrency: String(env.OPENAI_MAX_CONCURRENCY ?? ""),
    };
  }
  return {
    modelType: "anthropic",
    baseUrl: String(env.ANTHROPIC_BASE_URL ?? ""),
    apiKey: String(env.ANTHROPIC_AUTH_TOKEN ?? ""),
    haikuModel: String(env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? ""),
    sonnetModel: String(env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ""),
    opusModel: String(env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? ""),
    maxConcurrency: "",
  };
}

function normalizeOptionalNonNegativeIntegerString(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^\d+$/.test(raw)) {
    throw new Error("maxConcurrency must be a non-negative integer");
  }
  return String(Number.parseInt(raw, 10));
}

function buildEnvFromForm(body) {
  const env = {};
  if (body.modelType === "openai") {
    if (body.baseUrl) env.OPENAI_BASE_URL = body.baseUrl;
    if (body.apiKey) env.OPENAI_API_KEY = body.apiKey;
    const maxConcurrency = normalizeOptionalNonNegativeIntegerString(
      body.maxConcurrency,
    );
    if (maxConcurrency) env.OPENAI_MAX_CONCURRENCY = maxConcurrency;
    if (body.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = body.haikuModel;
    if (body.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = body.sonnetModel;
    if (body.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = body.opusModel;
  } else {
    if (body.baseUrl) env.ANTHROPIC_BASE_URL = body.baseUrl;
    if (body.apiKey) env.ANTHROPIC_AUTH_TOKEN = body.apiKey;
    if (body.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = body.haikuModel;
    if (body.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = body.sonnetModel;
    if (body.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = body.opusModel;
  }
  return env;
}

const MANAGED_API_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MAX_CONCURRENCY",
  "CLAUDE_CODE_USE_OPENAI",
];

function stripConflictingEnvKeys(env, modelType) {
  const next = { ...env };
  if (modelType === "openai") {
    delete next.ANTHROPIC_BASE_URL;
    delete next.ANTHROPIC_AUTH_TOKEN;
  } else {
    delete next.OPENAI_BASE_URL;
    delete next.OPENAI_API_KEY;
    delete next.OPENAI_MAX_CONCURRENCY;
  }
  delete next.CLAUDE_CODE_USE_OPENAI;
  return next;
}

function mergeSettingsFile(existing, patch) {
  const base = existing && typeof existing === "object" ? existing : {};
  const prevEnv =
    base.env && typeof base.env === "object" ? { ...base.env } : {};
  for (const key of MANAGED_API_ENV_KEYS) {
    delete prevEnv[key];
  }
  const mergedEnv = stripConflictingEnvKeys(
    { ...prevEnv, ...patch.env },
    patch.modelType,
  );
  return {
    ...base,
    modelType: patch.modelType,
    env: mergedEnv,
  };
}

function openaiModelsUrl(baseUrl) {
  const b = String(baseUrl).replace(/\/$/, "");
  if (b.endsWith("/models")) return b;
  return `${b}/models`;
}

function openaiChatUrl(baseUrl) {
  const b = String(baseUrl).replace(/\/$/, "");
  if (b.endsWith("/chat/completions")) return b;
  return `${b}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl) {
  const b = String(baseUrl).replace(/\/$/, "");
  if (b.endsWith("/messages")) return b;
  return `${b}/messages`;
}

async function fetchOpenAIModels(baseUrl, apiKey) {
  const url = openaiModelsUrl(baseUrl);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${text.slice(0, 400)}` };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON from /models" };
  }
  const list = data?.data;
  if (!Array.isArray(list)) {
    return { ok: false, error: "Unexpected /models shape" };
  }
  const ids = list
    .map((x) => x?.id)
    .filter((x) => typeof x === "string");
  return { ok: true, models: [...new Set(ids)].sort() };
}

function autoAssignModels(ids) {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  const L = (s) => s.toLowerCase();
  const pick = (pred) => sorted.find((m) => pred(L(m)));

  let haiku =
    pick((l) => /haiku|mini|small|tiny|nano|flash|8b|7b/.test(l)) ||
    sorted[0] ||
    "";
  let opus =
    pick((l) => /opus|o3|large|max|72b|70b|405|big/.test(l)) ||
    sorted[sorted.length - 1] ||
    "";
  let sonnet =
    pick((l) => /sonnet|qwen|deepseek|gpt-4|32b|coder/.test(l)) ||
    sorted[Math.min(1, Math.max(0, sorted.length - 1))] ||
    "";

  if (sorted.length === 1) {
    haiku = sonnet = opus = sorted[0];
  } else if (sorted.length === 2) {
    haiku = sorted[0];
    sonnet = opus = sorted[1];
  }
  return { haiku, sonnet, opus };
}

async function testOpenAIModel(baseUrl, apiKey, modelId) {
  const url = openaiChatUrl(baseUrl);
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  const ms = Date.now() - started;
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, latencyMs: ms, error: `${res.status} ${text.slice(0, 500)}` };
  }
  return { ok: true, latencyMs: ms };
}

async function testAnthropicModel(baseUrl, apiKey, modelId) {
  const url = anthropicMessagesUrl(baseUrl);
  const started = Date.now();
  const body = {
    model: modelId,
    max_tokens: 1,
    messages: [{ role: "user", content: "ping" }],
  };
  const tryFetch = async (headers) => {
    return fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  };

  let res = await tryFetch({
    Authorization: `Bearer ${apiKey}`,
    "anthropic-version": "2023-06-01",
  });
  if (res.status === 401 || res.status === 403) {
    res = await tryFetch({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
  }
  const ms = Date.now() - started;
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, latencyMs: ms, error: `${res.status} ${text.slice(0, 500)}` };
  }
  return { ok: true, latencyMs: ms };
}

async function readBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleApi(method, urlPath, req, res) {
  const settingsPath = getUserSettingsPath();
  const profilesPath = getProfilesPath();

  if (method === "GET" && urlPath === "/api/state") {
    let settings = null;
    try {
      settings = readJsonSafe(settingsPath, null);
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
      return;
    }
    const active = settings ? extractFormFromSettings(settings) : null;
    let profilesStore = { version: 1, profiles: [] };
    try {
      profilesStore = readJsonSafe(profilesPath, profilesStore);
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
      return;
    }
    const profiles = Array.isArray(profilesStore.profiles)
      ? profilesStore.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          modelType: p.modelType,
          baseUrl: p.baseUrl,
          apiKeyMasked: maskKey(p.apiKey),
          haikuModel: p.haikuModel ?? "",
          sonnetModel: p.sonnetModel ?? "",
          opusModel: p.opusModel ?? "",
          maxConcurrency: p.maxConcurrency ?? "",
          updatedAt: p.updatedAt,
        }))
      : [];

    json(res, 200, {
      settingsPath,
      profilesPath,
      claudeDir: getClaudeDir(),
      active,
      activeMasked: active
        ? { ...active, apiKey: maskKey(active.apiKey) }
        : null,
      profiles,
    });
    return;
  }

  if (method === "POST" && urlPath === "/api/apply") {
    const body = await readBody(req);
    if (!body || typeof body !== "object") {
      json(res, 400, { error: "Invalid JSON body" });
      return;
    }
    const modelType = body.modelType === "openai" ? "openai" : "anthropic";
    let patch;
    try {
      patch = {
        modelType,
        env: buildEnvFromForm({ ...body, modelType }),
      };
    } catch (e) {
      json(res, 400, { error: String(e.message || e) });
      return;
    }
    let existing = {};
    try {
      existing = readJsonSafe(settingsPath, {});
    } catch (e) {
      json(res, 500, { error: String(e.message || e) });
      return;
    }
    const merged = mergeSettingsFile(existing, patch);
    try {
      writeJsonAtomic(settingsPath, merged);
    } catch (e) {
      json(res, 500, { error: `Write failed: ${e.message || e}` });
      return;
    }

    if (body.saveProfileName && String(body.saveProfileName).trim()) {
      const name = String(body.saveProfileName).trim();
      let store = readJsonSafe(profilesPath, { version: 1, profiles: [] });
      if (!Array.isArray(store.profiles)) store.profiles = [];
      const id = crypto.randomUUID();
      store.profiles.push({
        id,
        name,
        modelType: patch.modelType,
        baseUrl: body.baseUrl ?? "",
        apiKey: body.apiKey ?? "",
        haikuModel: body.haikuModel ?? "",
        sonnetModel: body.sonnetModel ?? "",
        opusModel: body.opusModel ?? "",
        maxConcurrency: normalizeOptionalNonNegativeIntegerString(
          body.maxConcurrency,
        ),
        updatedAt: new Date().toISOString(),
      });
      writeJsonAtomic(profilesPath, store);
    }

    json(res, 200, { ok: true, savedPath: settingsPath });
    return;
  }

  if (method === "POST" && urlPath === "/api/profiles/delete") {
    const body = await readBody(req);
    const id = body?.id;
    if (!id) {
      json(res, 400, { error: "Missing id" });
      return;
    }
    let store = readJsonSafe(profilesPath, { version: 1, profiles: [] });
    if (!Array.isArray(store.profiles)) store.profiles = [];
    store.profiles = store.profiles.filter((p) => p.id !== id);
    writeJsonAtomic(profilesPath, store);
    json(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && urlPath === "/api/profiles/save") {
    const body = await readBody(req);
    if (!body?.name?.trim()) {
      json(res, 400, { error: "Missing name" });
      return;
    }
    const modelType = body.modelType === "openai" ? "openai" : "anthropic";
    let store = readJsonSafe(profilesPath, { version: 1, profiles: [] });
    if (!Array.isArray(store.profiles)) store.profiles = [];
    let maxConcurrency;
    try {
      maxConcurrency = normalizeOptionalNonNegativeIntegerString(
        body.maxConcurrency,
      );
    } catch (e) {
      json(res, 400, { error: String(e.message || e) });
      return;
    }
    const entry = {
      id: body.id && String(body.id).length > 0 ? String(body.id) : crypto.randomUUID(),
      name: String(body.name).trim(),
      modelType,
      baseUrl: String(body.baseUrl ?? ""),
      apiKey: String(body.apiKey ?? ""),
      haikuModel: String(body.haikuModel ?? ""),
      sonnetModel: String(body.sonnetModel ?? ""),
      opusModel: String(body.opusModel ?? ""),
      maxConcurrency,
      updatedAt: new Date().toISOString(),
    };
    const idx = store.profiles.findIndex((p) => p.id === entry.id);
    if (idx >= 0) store.profiles[idx] = entry;
    else store.profiles.push(entry);
    writeJsonAtomic(profilesPath, store);
    json(res, 200, { ok: true, profile: entry });
    return;
  }

  if (method === "POST" && urlPath === "/api/apply-profile") {
    const body = await readBody(req);
    const id = body?.id;
    if (!id) {
      json(res, 400, { error: "Missing id" });
      return;
    }
    const store = readJsonSafe(profilesPath, { version: 1, profiles: [] });
    const p = store.profiles?.find((x) => x.id === id);
    if (!p) {
      json(res, 404, { error: "Profile not found" });
      return;
    }
    const patch = {
      modelType: p.modelType,
      env: buildEnvFromForm(p),
    };
    let existing = readJsonSafe(settingsPath, {});
    const merged = mergeSettingsFile(existing, patch);
    writeJsonAtomic(settingsPath, merged);
    json(res, 200, { ok: true, savedPath: settingsPath });
    return;
  }

  if (method === "POST" && urlPath === "/api/discover") {
    const body = await readBody(req);
    const modelType = body?.modelType === "openai" ? "openai" : "anthropic";
    const baseUrl = String(body?.baseUrl ?? "").trim();
    const apiKey = String(body?.apiKey ?? "").trim();
    if (!baseUrl || !apiKey) {
      json(res, 400, { error: "baseUrl and apiKey required" });
      return;
    }
    if (modelType === "anthropic") {
      json(res, 200, {
        models: [],
        hint: "Anthropic 兼容网关通常无标准列表接口；请从服务商文档获取模型 ID，或使用 OpenAI 兼容模式拉取 /v1/models。",
      });
      return;
    }
    const r = await fetchOpenAIModels(baseUrl, apiKey);
    if (!r.ok) {
      json(res, 200, { models: [], error: r.error });
      return;
    }
    const assigned = autoAssignModels(r.models);
    json(res, 200, { models: r.models, assigned });
    return;
  }

  if (method === "POST" && urlPath === "/api/load-profile") {
    const body = await readBody(req);
    const id = body?.id;
    if (!id) {
      json(res, 400, { error: "Missing id" });
      return;
    }
    const store = readJsonSafe(profilesPath, { version: 1, profiles: [] });
    const p = store.profiles?.find((x) => x.id === id);
    if (!p) {
      json(res, 404, { error: "Profile not found" });
      return;
    }
    json(res, 200, { profile: p });
    return;
  }

  if (method === "POST" && urlPath === "/api/test") {
    const body = await readBody(req);
    const modelType = body?.modelType === "openai" ? "openai" : "anthropic";
    const baseUrl = String(body?.baseUrl ?? "").trim();
    const apiKey = String(body?.apiKey ?? "").trim();
    const modelId = String(body?.modelId ?? "").trim();
    if (!baseUrl || !apiKey || !modelId) {
      json(res, 400, { error: "baseUrl, apiKey, modelId required" });
      return;
    }
    try {
      if (modelType === "openai") {
        const r = await testOpenAIModel(baseUrl, apiKey, modelId);
        json(res, 200, r);
        return;
      }
      const r = await testAnthropicModel(baseUrl, apiKey, modelId);
      json(res, 200, r);
      return;
    } catch (e) {
      json(res, 200, {
        ok: false,
        error: e?.name === "TimeoutError" ? "Timeout" : String(e?.message || e),
      });
      return;
    }
  }

  json(res, 404, { error: "Not found" });
}

const port = Number(process.env.SETTINGS_UI_PORT) || 9876;

const server = http.createServer((req, res) => {
  const host = req.headers.host ?? "localhost";
  let url;
  try {
    url = new URL(req.url ?? "/", `http://${host}`);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const method = req.method ?? "GET";
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (method === "GET" || method === "POST") {
      handleApi(method, url.pathname, req, res).catch((e) => {
        json(res, 500, { error: String(e?.message || e) });
      });
      return;
    }
    res.writeHead(405);
    res.end();
    return;
  }

  try {
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (pathname.includes("..")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const filePath = path.normalize(path.join(root, pathname));
    if (!isPathInsideRoot(root, filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    res.setHeader("Content-Type", type);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end(err instanceof Error ? err.message : "Internal error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Settings UI + API: http://127.0.0.1:${port}/`);
  console.log(`Static root: ${root}`);
  console.log(`User settings: ${getUserSettingsPath()}`);
});
