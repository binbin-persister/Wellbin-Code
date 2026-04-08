/**
 * Wellbin Code settings UI — requires local server (serve-settings-ui.mjs).
 */

const TAB_ANTHROPIC = "anthropic";
const TAB_OPENAI = "openai";

/** @type {{ models: string[], assigned?: { haiku: string, sonnet: string, opus: string }, error?: string } | null} */
let lastDiscover = null;

function currentMode() {
  const t = document.querySelector(".tab.is-active")?.getAttribute("data-tab");
  return t === TAB_OPENAI ? TAB_OPENAI : TAB_ANTHROPIC;
}

function currentForm() {
  return /** @type {HTMLFormElement} */ (
    currentMode() === TAB_OPENAI
      ? document.getElementById("form-openai")
      : document.getElementById("form-anthropic")
  );
}

/**
 * @param {HTMLFormElement} form
 * @returns {{ baseUrl: string, apiKey: string, haikuModel: string, sonnetModel: string, opusModel: string, maxConcurrency: string }}
 */
function readForm(form) {
  const fd = new FormData(form);
  return {
    baseUrl: String(fd.get("baseUrl") ?? "").trim(),
    apiKey: String(fd.get("apiKey") ?? "").trim(),
    haikuModel: String(fd.get("haikuModel") ?? "").trim(),
    sonnetModel: String(fd.get("sonnetModel") ?? "").trim(),
    opusModel: String(fd.get("opusModel") ?? "").trim(),
    maxConcurrency: String(fd.get("maxConcurrency") ?? "").trim(),
  };
}

/**
 * @param {'anthropic'|'openai'} mode
 * @param {ReturnType<typeof readForm>} v
 */
function buildSettingsObject(mode, v) {
  const env = {};
  if (mode === "anthropic") {
    if (v.baseUrl) env.ANTHROPIC_BASE_URL = v.baseUrl;
    if (v.apiKey) env.ANTHROPIC_AUTH_TOKEN = v.apiKey;
    if (v.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = v.haikuModel;
    if (v.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = v.sonnetModel;
    if (v.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = v.opusModel;
    return { modelType: "anthropic", env };
  }
  if (v.baseUrl) env.OPENAI_BASE_URL = v.baseUrl;
  if (v.apiKey) env.OPENAI_API_KEY = v.apiKey;
  if (v.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = v.haikuModel;
  if (v.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = v.sonnetModel;
  if (v.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = v.opusModel;
  if (v.maxConcurrency) env.OPENAI_MAX_CONCURRENCY = v.maxConcurrency;
  return { modelType: "openai", env };
}

/** @param {string} message */
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function apiFetch(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid JSON" };
  }
  if (!r.ok) {
    throw new Error(data.error || `${r.status}`);
  }
  return data;
}

function setApiOnline(state) {
  const off = document.getElementById("api-offline");
  const on = document.getElementById("api-online");
  if (!off || !on) return;
  off.hidden = state;
  on.hidden = !state;
}

function fillForm(mode, data) {
  const form =
    mode === TAB_OPENAI
      ? document.getElementById("form-openai")
      : document.getElementById("form-anthropic");
  if (!form) return;
  /** @type {HTMLInputElement | null} */
  const set = (name, val) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) el.value = val ?? "";
  };
  set("baseUrl", data.baseUrl);
  set("apiKey", data.apiKey);
  set("haikuModel", data.haikuModel);
  set("sonnetModel", data.sonnetModel);
  set("opusModel", data.opusModel);
  set("maxConcurrency", data.maxConcurrency);
}

function updatePreview() {
  const form = currentForm();
  const mode = currentMode();
  const el = document.getElementById("preview-json");
  if (el) {
    el.textContent = `${JSON.stringify(buildSettingsObject(mode, readForm(form)), null, 2)}\n`;
  }
}

function renderActiveSummary(activeMasked, active) {
  const el = document.getElementById("active-summary");
  if (!el) return;
  if (!activeMasked && !active) {
    el.innerHTML = '<span class="muted">尚无配置或文件不存在。填写下方表单后「保存并应用」即可。</span>';
    return;
  }
  const m = activeMasked || {
    ...active,
    apiKey: active?.apiKey ? "（已配置）" : "",
  };
  const typeLabel = m.modelType === "openai" ? "OpenAI 兼容" : "Anthropic Messages";
  const concurrencyLabel =
    m.modelType === "openai"
      ? m.maxConcurrency || "默认"
      : "—";
  el.innerHTML = `
    <div class="pill-row">
      <span class="pill">${typeLabel}</span>
      <span class="mono muted">${escapeHtml(m.baseUrl || "—")}</span>
    </div>
    <div class="model-row">
      <span><strong>H</strong> ${escapeHtml(m.haikuModel || "—")}</span>
      <span><strong>S</strong> ${escapeHtml(m.sonnetModel || "—")}</span>
      <span><strong>O</strong> ${escapeHtml(m.opusModel || "—")}</span>
      <span class="muted">Key: ${escapeHtml(m.apiKey || "—")}</span>
      <span class="muted">Gate: ${escapeHtml(concurrencyLabel)}</span>
    </div>
  `;
}

/** @param {string} s */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderProfiles(profiles) {
  const tbody = document.getElementById("profiles-tbody");
  if (!tbody) return;
  if (!profiles?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">暂无档案。填写表单后「仅保存档案」或勾选另存名称后应用。</td></tr>';
    return;
  }
  tbody.innerHTML = profiles
    .map(
      (p) => `
    <tr data-id="${escapeHtml(p.id)}">
      <td>${escapeHtml(p.name)}</td>
      <td>${p.modelType === "openai" ? "OpenAI" : "Anthropic"}</td>
      <td class="mono small">${escapeHtml(trunc(p.baseUrl, 40))}</td>
      <td class="mono small">${escapeHtml(trunc(`${p.haikuModel || "—"} / ${p.sonnetModel || "—"} / ${p.opusModel || "—"}${p.modelType === "openai" ? ` · gate ${p.maxConcurrency || "默认"}` : ""}`, 56))}</td>
      <td class="nowrap">
        <button type="button" class="btn sm js-load">载入</button>
        <button type="button" class="btn sm js-apply">应用</button>
        <button type="button" class="btn sm danger js-del">删除</button>
      </td>
    </tr>`,
    )
    .join("");

  for (const btn of tbody.querySelectorAll(".js-load")) {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.getAttribute("data-id");
      if (id) void loadProfileIntoForm(id);
    });
  }
  for (const btn of tbody.querySelectorAll(".js-apply")) {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.getAttribute("data-id");
      if (id) void applyProfile(id);
    });
  }
  for (const btn of tbody.querySelectorAll(".js-del")) {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.getAttribute("data-id");
      if (id) void deleteProfile(id);
    });
  }
}

function trunc(s, n) {
  if (!s || s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

async function loadState() {
  try {
    const data = await apiFetch("/api/state");
    setApiOnline(true);
    document.getElementById("path-settings").textContent = data.settingsPath ?? "";
    document.getElementById("path-profiles").textContent = data.profilesPath ?? "";
    renderActiveSummary(data.activeMasked, data.active);
    if (data.active) {
      const m = data.active.modelType === "openai" ? TAB_OPENAI : TAB_ANTHROPIC;
      switchTab(m);
      fillForm(m, data.active);
    }
    renderProfiles(data.profiles);
    updateDiscoverHint();
    updatePreview();
  } catch {
    setApiOnline(false);
    renderActiveSummary(null, null);
  }
}

function switchTab(tab) {
  for (const t of document.querySelectorAll(".tab")) {
    const active = t.getAttribute("data-tab") === tab;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  }
  const pa = document.getElementById("panel-anthropic");
  const po = document.getElementById("panel-openai");
  if (pa && po) {
    const isA = tab === TAB_ANTHROPIC;
    pa.classList.toggle("is-active", isA);
    pa.hidden = !isA;
    po.classList.toggle("is-active", !isA);
    po.hidden = isA;
  }
  updateDiscoverHint();
  updatePreview();
}

function updateDiscoverHint() {
  const el = document.getElementById("discover-hint");
  if (!el) return;
  if (currentMode() === TAB_ANTHROPIC) {
    el.textContent =
      "Anthropic 模式：请手动填写模型 ID。测试会使用 Messages API 发一条最小请求。拉取列表仅适用于 OpenAI 兼容模式。";
  } else {
    el.textContent = "OpenAI 模式：可先拉取 /v1/models，再一键填充三套模型并逐项测试。";
  }
}

async function loadProfileIntoForm(id) {
  try {
    const data = await apiFetch("/api/load-profile", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    const p = data.profile;
    if (!p) return;
    switchTab(p.modelType === "openai" ? TAB_OPENAI : TAB_ANTHROPIC);
    fillForm(p.modelType === "openai" ? TAB_OPENAI : TAB_ANTHROPIC, p);
    updatePreview();
    showToast("已载入档案到表单");
  } catch (e) {
    showToast(String(e.message || e));
  }
}

async function applyProfile(id) {
  try {
    await apiFetch("/api/apply-profile", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    showToast("已应用档案到 Wellbin Code 配置");
    await loadState();
  } catch (e) {
    showToast(String(e.message || e));
  }
}

async function deleteProfile(id) {
  if (!confirm("确定删除该档案？")) return;
  try {
    await apiFetch("/api/profiles/delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    showToast("已删除");
    await loadState();
  } catch (e) {
    showToast(String(e.message || e));
  }
}

function getPayload() {
  const form = currentForm();
  const mode = currentMode();
  const v = readForm(form);
  return { modelType: mode === TAB_OPENAI ? "openai" : "anthropic", ...v };
}

async function applyCurrent() {
  const name = document.getElementById("save-profile-name")?.value?.trim();
  const payload = {
    ...getPayload(),
    ...(name ? { saveProfileName: name } : {}),
  };
  try {
    await apiFetch("/api/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("已保存并应用到 settings.json");
    const sn = document.getElementById("save-profile-name");
    if (sn) sn.value = "";
    await loadState();
  } catch (e) {
    showToast(String(e.message || e));
  }
}

async function saveProfileOnly() {
  const name = document.getElementById("save-profile-name")?.value?.trim();
  if (!name) {
    showToast("请填写「另存为档案」名称");
    return;
  }
  const p = getPayload();
  try {
    await apiFetch("/api/profiles/save", {
      method: "POST",
      body: JSON.stringify({ name, ...p }),
    });
    showToast("档案已保存");
    await loadState();
  } catch (e) {
    showToast(String(e.message || e));
  }
}

async function discover() {
  const p = getPayload();
  try {
    const data = await apiFetch("/api/discover", {
      method: "POST",
      body: JSON.stringify({
        modelType: p.modelType,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
      }),
    });
    lastDiscover = data;
    const wrap = document.getElementById("models-list");
    if (wrap) {
      if (data.models?.length) {
        wrap.hidden = false;
        wrap.innerHTML = data.models
          .slice(0, 80)
          .map((m) => `<span class="chip">${escapeHtml(m)}</span>`)
          .join("");
        if (data.models.length > 80) {
          wrap.innerHTML += `<span class="muted">…共 ${data.models.length} 个</span>`;
        }
      } else {
        wrap.hidden = true;
        wrap.innerHTML = "";
      }
    }
    if (data.error) {
      showToast(`拉取失败: ${data.error}`);
    } else if (data.hint) {
      showToast(data.hint);
    } else {
      showToast(`已获取 ${data.models?.length ?? 0} 个模型`);
    }
    if (data.assigned) {
      const form = currentForm();
      const h = form.querySelector('[name="haikuModel"]');
      const s = form.querySelector('[name="sonnetModel"]');
      const o = form.querySelector('[name="opusModel"]');
      if (h) h.value = data.assigned.haiku || "";
      if (s) s.value = data.assigned.sonnet || "";
      if (o) o.value = data.assigned.opus || "";
      updatePreview();
    }
  } catch (e) {
    showToast(String(e.message || e));
  }
}

async function autoAssign() {
  if (currentMode() === TAB_ANTHROPIC) {
    showToast("请切换到 OpenAI 兼容并填写 Base URL / Key 后拉取列表");
    return;
  }
  if (lastDiscover?.assigned) {
    const form = currentForm();
    const h = form.querySelector('[name="haikuModel"]');
    const s = form.querySelector('[name="sonnetModel"]');
    const o = form.querySelector('[name="opusModel"]');
    if (h) h.value = lastDiscover.assigned.haiku || "";
    if (s) s.value = lastDiscover.assigned.sonnet || "";
    if (o) o.value = lastDiscover.assigned.opus || "";
    updatePreview();
    showToast("已按上次拉取结果填充");
    return;
  }
  await discover();
}

async function testModel(role) {
  const p = getPayload();
  const form = currentForm();
  const map = {
    haiku: form.querySelector('[name="haikuModel"]')?.value?.trim() ?? "",
    sonnet: form.querySelector('[name="sonnetModel"]')?.value?.trim() ?? "",
    opus: form.querySelector('[name="opusModel"]')?.value?.trim() ?? "",
  };
  const modelId = map[role];
  if (!modelId) {
    showToast(`请先填写 ${role} 模型 ID`);
    return;
  }
  const out = document.getElementById("test-results");
  const line = document.createElement("div");
  line.className = "test-line";
  line.textContent = `测试中 ${role} (${modelId})…`;
  out?.append(line);
  try {
    const data = await apiFetch("/api/test", {
      method: "POST",
      body: JSON.stringify({
        modelType: p.modelType,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        modelId,
      }),
    });
    line.className = `test-line ${data.ok ? "ok" : "err"}`;
    line.textContent = data.ok
      ? `✓ ${role} ${modelId} — ${data.latencyMs ?? "?"} ms`
      : `✗ ${role} ${modelId} — ${data.error || "failed"}`;
  } catch (e) {
    line.className = "test-line err";
    line.textContent = `✗ ${role} — ${e.message || e}`;
  }
}

async function testAll() {
  document.getElementById("test-results").innerHTML = "";
  for (const r of ["haiku", "sonnet", "opus"]) {
    await testModel(r);
  }
}

function setupTabs() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-tab");
      if (id === TAB_OPENAI || id === TAB_ANTHROPIC) switchTab(id);
    });
  }
}

function setupForms() {
  for (const id of ["form-anthropic", "form-openai"]) {
    document.getElementById(id)?.addEventListener("input", () => updatePreview());
  }
}

document.getElementById("btn-apply")?.addEventListener("click", () => void applyCurrent());
document.getElementById("btn-save-profile")?.addEventListener("click", () => void saveProfileOnly());
document.getElementById("btn-refresh-profiles")?.addEventListener("click", () => void loadState());
document.getElementById("btn-discover")?.addEventListener("click", () => void discover());
document.getElementById("btn-auto-assign")?.addEventListener("click", () => void autoAssign());
document.getElementById("btn-test-haiku")?.addEventListener("click", () => void testModel("haiku"));
document.getElementById("btn-test-sonnet")?.addEventListener("click", () => void testModel("sonnet"));
document.getElementById("btn-test-opus")?.addEventListener("click", () => void testModel("opus"));
document.getElementById("btn-test-all")?.addEventListener("click", () => void testAll());

document.getElementById("btn-copy-json")?.addEventListener("click", async () => {
  const form = currentForm();
  const mode = currentMode();
  const text = JSON.stringify(buildSettingsObject(mode, readForm(form)), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制");
  } catch {
    showToast("复制失败");
  }
});

document.getElementById("btn-download")?.addEventListener("click", () => {
  const form = currentForm();
  const mode = currentMode();
  const blob = new Blob([JSON.stringify(buildSettingsObject(mode, readForm(form)), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = mode === TAB_OPENAI ? "claude-settings-openai.json" : "claude-settings-anthropic.json";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("已下载");
});

setupTabs();
setupForms();
void loadState();
updatePreview();
