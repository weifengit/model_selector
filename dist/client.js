window.__ModuleLoader__.load({
	id: "dsh-model-selector",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/src/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// client/src/picker.tsx
var import_react3 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// client/src/domain.ts
var VENDORS = [
  { id: "codearts", name: "CodeArts", org: "\u534E\u4E3A\u4E91", accent: "#C7000B", unit: "credits", balance: true },
  { id: "buddy", name: "WorkBuddy \u56FD\u5185\u7248", org: "\u817E\u8BAF \xB7 copilot.tencent.com", accent: "#0A7AFF", unit: "credits", balance: true },
  { id: "workbuddy", name: "WorkBuddy \u56FD\u9645\u7248", org: "\u817E\u8BAF \xB7 workbuddy.ai", accent: "#0B63CE", unit: "credits", balance: false },
  { id: "lobsterai", name: "LobsterAI", org: "\u6709\u9053", accent: "#FF6A00", unit: "credits", balance: true },
  { id: "qoder", name: "Qoder", org: "\u963F\u91CC\u7CFB", accent: "#615CED", unit: "credits", balance: true },
  { id: "qodercn", name: "Qoder \u4E2D\u56FD\u7248", org: "\u963F\u91CC\u7CFB", accent: "#7A6CF0", unit: "credits", balance: true },
  { id: "trae", name: "TRAE", org: "\u5B57\u8282", accent: "#00BFA6", unit: "credits", balance: true },
  { id: "cline", name: "Cline", org: "Cline", accent: "#5B5BD6", unit: "dollars", balance: true },
  { id: "loomy", name: "Loomy", org: "\u8BAF\u98DE", accent: "#2F6BFF", unit: "credits", balance: true },
  { id: "raccoon", name: "Raccoon", org: "\u5546\u6C64", accent: "#00A6A6", unit: "credits", balance: true },
  { id: "minimax", name: "MiniMax Code", org: "MiniMax", accent: "#E4007F", unit: "credits", balance: true },
  { id: "zcode", name: "ZCode", org: "\u667A\u8C31", accent: "#3B6EF6", unit: "tokens", balance: true },
  { id: "gemini", name: "Gemini", org: "Google Code Assist", accent: "#4285F4", unit: "quota", balance: true }
];

// client/src/data.ts
var OFM_API = "/api/our-free-model";
var CHANNEL_PACK_API = "/api/channel-pack";
var OWN_API = "/api/model-selector";
var LANE_ROUTES = ["our-free-model", "our-free-model-region"];
function isLaneRoute(provider) {
  return LANE_ROUTES.includes(provider);
}
var HttpError = class extends Error {
};
async function getJson(path, signal) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    ...signal === void 0 ? {} : { signal }
  });
  if (!response.ok) {
    throw new HttpError(`${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}
async function callChannelPack(method, payload, signal) {
  const rpcId = `ms-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const response = await fetch(CHANNEL_PACK_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId,
      method: "channel-pack",
      payload: { method, payload }
    }),
    ...signal === void 0 ? {} : { signal }
  });
  if (!response.ok) throw new HttpError(`${response.status} ${response.statusText}`.trim());
  const frame = await response.json();
  const result = frame.result;
  if (result === void 0) throw new HttpError("malformed rpc envelope");
  if (result.ok === true) return { ok: true, value: result.value };
  const error = result.error;
  return { ok: false, error: error?.message ?? error?.code ?? "rpc failed" };
}
var EMPTY_LANE = {
  total: 0,
  available: 0,
  regionBlocked: 0,
  unavailable: 0,
  throttled: 0,
  unknown: 0,
  channelsReady: false,
  channelsError: "",
  probedAt: 0
};
async function readLane(signal) {
  try {
    const payload = await getJson(`${OFM_API}/summary`, signal);
    const catalog = payload.catalog ?? [];
    const models = catalog.map((entry) => ({
      id: String(entry.id ?? ""),
      name: String(entry.name ?? entry.id ?? ""),
      availability: String(entry.availability ?? "unknown"),
      detail: String(entry.detail ?? ""),
      route: String(entry.route ?? ""),
      availabilitySource: String(entry.availabilitySource ?? ""),
      probedAt: Number(entry.probedAt ?? 0),
      hiddenByUser: entry.hiddenByUser === true
    }));
    const counts = { available: 0, regionBlocked: 0, unavailable: 0, throttled: 0, unknown: 0 };
    for (const entry of models) {
      switch (entry.availability) {
        case "available":
          counts.available += 1;
          break;
        case "region-blocked":
          counts.regionBlocked += 1;
          break;
        case "unavailable":
          counts.unavailable += 1;
          break;
        case "throttled":
          counts.throttled += 1;
          break;
        default:
          counts.unknown += 1;
          break;
      }
    }
    const channels = payload.channels ?? {};
    return {
      lane: {
        total: models.length,
        ...counts,
        channelsReady: channels.state === "ready",
        channelsError: String(channels.error ?? ""),
        probedAt: Number(payload.probedAt ?? 0)
      },
      models,
      error: ""
    };
  } catch (error) {
    return { lane: EMPTY_LANE, models: [], error: messageOf(error) };
  }
}
async function readLaneModels(signal) {
  const { models } = await readLane(signal);
  return models;
}
async function readVendors(signal, hiddenByPanel) {
  let statuses = {};
  let statusError = "";
  try {
    const status = await callChannelPack(
      "provider.status",
      { providers: VENDORS.map((vendor) => vendor.id) },
      signal
    );
    if (status.ok) {
      statuses = status.value.statuses ?? {};
    } else {
      statusError = status.error;
    }
  } catch (error) {
    statusError = messageOf(error);
  }
  const rows = await Promise.all(VENDORS.map(async (vendor) => {
    const entry = statuses[vendor.id];
    const base = {
      vendor,
      state: "unknown",
      modelCount: Number(entry?.models?.total ?? 0),
      disabledCount: Number(entry?.models?.disabled ?? 0),
      visibleModelCount: Math.max(0, Number(entry?.models?.total ?? 0) - Number(entry?.models?.disabled ?? 0)),
      accountCount: Number(entry?.accounts?.total ?? 0),
      enabledAccountCount: Number(entry?.accounts?.enabled ?? 0),
      balance: null,
      error: statusError,
      at: Date.now()
    };
    if (entry === void 0) return null;
    if (entry.closed === true) {
      const state2 = hiddenByPanel.has(vendor.id) ? "hidden" : "closed";
      return { ...base, state: state2 };
    }
    if (!vendor.balance) {
      const state2 = base.enabledAccountCount > 0 ? "on" : base.accountCount > 0 ? "idle" : "unknown";
      return { ...base, state: state2, error: "" };
    }
    let balances;
    try {
      balances = await callChannelPack("credits.balances", { provider: vendor.id }, signal);
    } catch (error) {
      balances = { ok: false, error: messageOf(error) };
    }
    if (!balances.ok) {
      const unsupported = balances.error.includes("unsupported provider");
      return {
        ...base,
        state: base.enabledAccountCount > 0 ? "on" : base.accountCount > 0 ? "idle" : "unknown",
        error: unsupported ? "" : balances.error
      };
    }
    const accounts = balances.value.accounts ?? [];
    const known = accounts.filter((account) => numeric(account.balance?.total) !== null);
    const failed = accounts.filter((account) => account.error !== "");
    const balance = known.length === 0 ? null : known.reduce((sum, account) => sum + (numeric(account.balance?.total) ?? 0), 0);
    const state = base.enabledAccountCount > 0 ? "on" : base.accountCount > 0 ? "idle" : "unknown";
    return {
      ...base,
      state,
      balance,
      error: failed.length === 0 ? "" : failed[0]?.error ?? ""
    };
  }));
  return rows.filter((row) => row !== null);
}
async function readVendorModels(provider) {
  const result = await callChannelPack(
    "model.list",
    { provider }
  );
  if (!result.ok) throw new Error(result.error);
  return (result.value.models ?? []).map((model) => ({
    id: String(model.id ?? ""),
    name: String(model.name ?? model.id ?? ""),
    disabled: model.disabled === true,
    dead: model.dead === true
  }));
}
async function setVendorModelsDisabled(provider, modelIds, disabled) {
  const ids = [...new Set(modelIds.filter((id) => id !== ""))];
  if (ids.length === 0) return { changed: 0, error: "" };
  try {
    const result = await callChannelPack("model.setDisabledMany", {
      provider,
      modelIds: ids,
      disabled
    });
    if (!result.ok) return { changed: 0, error: result.error };
    return { changed: ids.length, error: "" };
  } catch (error) {
    return { changed: 0, error: messageOf(error) };
  }
}
var DEFAULT_SWITCH = { enabled: false, hidden: {} };
async function readSwitch() {
  try {
    const response = await fetch(`${OWN_API}/switch`, { headers: { accept: "application/json" } });
    if (!response.ok) return DEFAULT_SWITCH;
    const payload = await response.json();
    const hidden = {};
    for (const [provider, ids] of Object.entries(payload.hidden ?? {})) {
      if (Array.isArray(ids)) {
        hidden[provider] = ids.filter((id) => typeof id === "string");
      }
    }
    return { enabled: payload.enabled === true, hidden };
  } catch {
    return DEFAULT_SWITCH;
  }
}
async function writeSwitch(state) {
  const response = await fetch(`${OWN_API}/switch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: state.enabled, hidden: state.hidden })
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
  const payload = await response.json();
  return { enabled: payload.enabled === true, hidden: payload.hidden ?? {} };
}
async function readVerdictCache(signal) {
  try {
    const response = await fetch(`${OWN_API}/verdicts`, {
      headers: { accept: "application/json" },
      ...signal === void 0 ? {} : { signal }
    });
    if (!response.ok) return {};
    const payload = await response.json();
    const cache2 = {};
    for (const [id, row] of Object.entries(payload.results ?? {})) {
      if (typeof row?.state !== "string") continue;
      cache2[id] = {
        state: row.state,
        detail: typeof row.detail === "string" ? row.detail : "",
        at: Number.isFinite(row.at) ? Number(row.at) : 0
      };
    }
    return cache2;
  } catch {
    return {};
  }
}
function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// client/src/verdicts.ts
var POSITIVE = "available";
var NEGATIVE = /* @__PURE__ */ new Set([
  "region-blocked",
  "unavailable",
  "throttled",
  "no-credit",
  "no-credential"
]);
function probeTtl(state) {
  return state === "available" ? 60 * 60 * 1e3 : 6 * 60 * 60 * 1e3;
}
function isUsable(verdict) {
  return verdict.state === POSITIVE;
}
function isRefused(verdict) {
  return NEGATIVE.has(verdict.state);
}
function isVendorFault(state) {
  return state === "no-credential" || state === "no-credit";
}
function laneVerdict(row) {
  const state = normalise(row.availability);
  const source = row.availabilitySource;
  if (source === "manual") return { state, source: "lane-manual", detail: row.detail ?? "", at: row.probedAt ?? 0 };
  if (source === "probe") return { state, source: "lane-probe", detail: row.detail ?? "", at: row.probedAt ?? 0 };
  if (state === "unknown") return { state: "unknown", source: "listing", detail: row.detail ?? "", at: 0 };
  return { state, source: "lane-probe", detail: row.detail ?? "", at: row.probedAt ?? 0 };
}
function cachedVerdict(cache2, id, now = Date.now()) {
  const row = cache2[id];
  if (row === void 0) return void 0;
  if (row.at <= 0 || now - row.at > probeTtl(row.state)) return void 0;
  return { state: row.state, source: "gateway-probe", detail: row.detail, at: row.at };
}
function bestVerdict(lane, cached) {
  if (lane === void 0 && cached === void 0) return { state: "unknown", source: "none", detail: "", at: 0 };
  if (lane === void 0) return cached;
  if (cached === void 0) return lane;
  if (cached.at > lane.at) return cached;
  if (lane.at > cached.at) return lane;
  return isUsable(lane) ? lane : cached;
}
function freshestVerdict(a, b) {
  if (a === void 0) return b;
  if (b === void 0) return a;
  return b.at > a.at ? b : a;
}
function probeKey(provider, modelId) {
  return `${provider}/${modelId}`;
}
function pickerProbeKey(provider, model) {
  return isLaneRoute(provider) ? model : probeKey(provider, model);
}
function laneCacheKeys(cache2, modelId) {
  const suffix = `/${modelId}`;
  return Object.keys(cache2).filter((key) => key !== modelId && key.endsWith(suffix)).sort((a, b) => a.length - b.length);
}
function cachedLaneVerdict(cache2, modelId, now = Date.now()) {
  for (const key of laneCacheKeys(cache2, modelId)) {
    const verdict = cachedVerdict(cache2, key, now);
    if (verdict !== void 0) return verdict;
  }
  return void 0;
}
function doomedModelIds(provider, models, verdicts, vendorUnusable) {
  const visible = models.filter((model) => !model.disabled && !model.dead);
  if (vendorUnusable) return visible.map((model) => model.id);
  return visible.filter((model) => {
    const verdict = verdicts[probeKey(provider, model.id)];
    return verdict !== void 0 && (isRefused(verdict) || isVendorFault(verdict.state));
  }).map((model) => model.id);
}
function normalise(value) {
  switch (value) {
    case "available":
      return "available";
    case "region-blocked":
      return "region-blocked";
    case "unavailable":
      return "unavailable";
    case "throttled":
      return "throttled";
    case "no-credit":
      return "no-credit";
    case "no-credential":
      return "no-credential";
    default:
      return "unknown";
  }
}

// client/src/verdict-copy.ts
function verdictLabel(state, t) {
  switch (state) {
    case "available":
      return t("model.available");
    case "region-blocked":
      return t("model.regionBlocked");
    case "unavailable":
      return t("model.unavailable");
    case "throttled":
      return t("model.throttled");
    case "no-credit":
      return t("model.noCredit");
    case "no-credential":
      return t("model.noCredential");
    default:
      return t("model.untested");
  }
}
function verdictTone(state) {
  if (state === "available") return "ok";
  if (state === void 0 || state === "unknown") return "unknown";
  return "refused";
}

// client/src/use-model-selector.ts
var import_react2 = require("react");

// client/src/probe.ts
var SWEEP_POLL_MS = 1500;
async function readGatewayPort(signal) {
  try {
    const response = await fetch(`${OFM_API}/chan-gateway`, {
      headers: { accept: "application/json" },
      ...signal === void 0 ? {} : { signal }
    });
    if (!response.ok) return 0;
    const payload = await response.json();
    const port = Number(payload.gateway?.port ?? 0);
    return Number.isInteger(port) && port > 0 ? port : 0;
  } catch {
    return 0;
  }
}
async function runSweep(port, targets, { signal, onProgress } = {}) {
  const started = await postSweep({ port, targets }, signal);
  if (started === null) return { verdicts: {}, error: "sweep-request-failed" };
  onProgress?.(started);
  if (started.error !== "") return { verdicts: {}, error: started.error };
  if (started.total === 0) return { verdicts: {}, error: "" };
  let status = started;
  while (status.running) {
    if (signal?.aborted === true) {
      await stopSweep(signal);
      break;
    }
    await delay(SWEEP_POLL_MS, signal);
    const next = await getSweep(signal);
    if (next === null) break;
    status = next;
    onProgress?.(status);
  }
  return { verdicts: { ...status.results }, error: status.error };
}
async function postSweep(plan, signal) {
  return request("/sweep", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(plan),
    ...signal === void 0 ? {} : { signal }
  });
}
async function getSweep(signal) {
  return request("/sweep", {
    headers: { accept: "application/json" },
    ...signal === void 0 ? {} : { signal }
  });
}
async function stopSweep(signal) {
  return request("/sweep/stop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...signal === void 0 ? {} : { signal }
  });
}
async function request(path, init) {
  try {
    const response = await fetch(`${OWN_API}${path}`, init);
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      running: payload.running === true,
      total: Number(payload.total ?? 0),
      done: Number(payload.done ?? 0),
      error: String(payload.error ?? ""),
      startedAt: Number(payload.startedAt ?? 0),
      results: payload.results ?? {}
    };
  } catch {
    return null;
  }
}
function delay(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      done();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// client/src/sweep.ts
var LANE_GATEWAY_PREFIX = "our-free-model/";
var MAX_SWEEP = 240;
function gatewayModelId(key, provider) {
  return provider === "" ? `${LANE_GATEWAY_PREFIX}${key}` : key;
}
function targetFor(provider, modelId, label, lane) {
  const key = lane ? modelId : probeKey(provider, modelId);
  return {
    key,
    provider: lane ? "" : provider,
    label,
    modelId: gatewayModelId(key, lane ? "" : provider)
  };
}
function planSweep(lane, vendorModels, cache2, verdicts, now = Date.now()) {
  const targets = [];
  for (const row of lane) {
    if (row.hiddenByUser === true) continue;
    if (!needsAsking(row.id, verdicts, cache2, now)) continue;
    targets.push({
      key: row.id,
      provider: "",
      label: row.name,
      modelId: gatewayModelId(row.id, "")
    });
  }
  for (const [provider, models] of Object.entries(vendorModels)) {
    if (vendorFaulted(provider, models, verdicts)) continue;
    for (const model of models) {
      if (model.disabled === true || model.dead === true) continue;
      const key = probeKey(provider, model.id);
      if (!needsAsking(key, verdicts, cache2, now)) continue;
      targets.push({
        key,
        provider,
        label: model.name,
        modelId: gatewayModelId(key, provider)
      });
    }
  }
  return targets.slice(0, MAX_SWEEP);
}
function needsAsking(key, verdicts, cache2, now) {
  const verdict = verdicts[key];
  if (verdict !== void 0 && verdict.state !== "unknown") return false;
  const stored = cache2[key];
  if (stored !== void 0 && stored.at > 0 && now - stored.at <= probeTtl(stored.state)) return false;
  return true;
}
function vendorFaulted(provider, models, verdicts) {
  for (const model of models) {
    if (model.disabled === true || model.dead === true) continue;
    const verdict = verdicts[probeKey(provider, model.id)];
    if (verdict !== void 0 && isVendorFault(verdict.state)) return true;
  }
  return false;
}

// client/src/verdict-store.ts
var import_react = require("react");
var EMPTY = Object.freeze({});
var MIN_READ_GAP_MS = 5e3;
var laneRows = [];
var cache = {};
var probes = {};
var snapshot = EMPTY;
var listeners = /* @__PURE__ */ new Set();
var inflight = null;
var lastReadAt = 0;
function fold() {
  const table = {};
  for (const row of laneRows) {
    const cached = freshestVerdict(cachedVerdict(cache, row.id), cachedLaneVerdict(cache, row.id));
    table[row.id] = bestVerdict(laneVerdict(row), cached);
  }
  for (const key of Object.keys(cache)) {
    if (table[key] !== void 0) continue;
    const fresh = cachedVerdict(cache, key);
    if (fresh !== void 0) table[key] = fresh;
  }
  for (const [key, verdict] of Object.entries(probes)) table[key] = verdict;
  return table;
}
function sameAnswers(a, b) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (right === void 0) return false;
    if (left.state !== right.state || left.at !== right.at || left.detail !== right.detail) return false;
  }
  return true;
}
function sameRoster(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (right === void 0) return false;
    if (left.id !== right.id || left.availability !== right.availability) return false;
    if (left.availabilitySource !== right.availabilitySource || left.probedAt !== right.probedAt) return false;
    if (left.hiddenByUser !== right.hiddenByUser || left.detail !== right.detail) return false;
  }
  return true;
}
function reflow() {
  const next = fold();
  if (sameAnswers(snapshot, next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}
function publishLaneModels(rows) {
  if (rows.length === 0 && laneRows.length > 0) return;
  if (sameRoster(laneRows, rows)) return;
  laneRows = rows;
  reflow();
}
function getVerdicts() {
  return snapshot;
}
function getCache() {
  return cache;
}
function refreshReadings(force = false) {
  if (inflight !== null) return inflight;
  if (!force && Date.now() - lastReadAt < MIN_READ_GAP_MS) return Promise.resolve();
  inflight = Promise.all([
    readLaneModels().catch(() => void 0),
    readVerdictCache().catch(() => void 0)
  ]).then(([rows, stored]) => {
    if (rows !== void 0 && rows.length > 0) laneRows = rows;
    if (stored !== void 0 && Object.keys(stored).length > 0) {
      cache = { ...cache, ...stored };
    }
    lastReadAt = Date.now();
    reflow();
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}
function recordProbes(landed) {
  const next = { ...probes };
  for (const [key, row] of Object.entries(landed)) {
    if (row.state === "unknown") continue;
    next[key] = { state: normalise(row.state), source: "gateway-probe", detail: row.detail, at: row.at };
  }
  probes = next;
  reflow();
}
function subscribeVerdicts(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function verdictSnapshot() {
  return snapshot;
}
function useVerdicts() {
  return (0, import_react.useSyncExternalStore)(subscribeVerdicts, verdictSnapshot);
}

// client/src/use-model-selector.ts
var POLL_MS = 9e4;
function useModelSelector() {
  const [vendors, setVendors] = (0, import_react2.useState)([]);
  const [laneModels, setLaneModels] = (0, import_react2.useState)([]);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)("");
  const [switchOn, setSwitchOn] = (0, import_react2.useState)(false);
  const [switchPending, setSwitchPending] = (0, import_react2.useState)(false);
  const [sweeping, setSweeping] = (0, import_react2.useState)(false);
  const [sweepProgress, setSweepProgress] = (0, import_react2.useState)({ done: 0, total: 0 });
  const [sweepError, setSweepError] = (0, import_react2.useState)("");
  const mounted = (0, import_react2.useRef)(true);
  const vendorsRef = (0, import_react2.useRef)([]);
  const hiddenRef = (0, import_react2.useRef)([]);
  const sweepRef = (0, import_react2.useRef)(null);
  const probingRef = (0, import_react2.useRef)({ keys: /* @__PURE__ */ new Set(), groups: /* @__PURE__ */ new Map() });
  const [probingKeys, setProbingKeys] = (0, import_react2.useState)(probingRef.current.keys);
  const [probingGroups, setProbingGroups] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  const verdicts = useVerdicts();
  const refresh = (0, import_react2.useCallback)(() => {
    setLoading(true);
    const controller = new AbortController();
    void readVendors(controller.signal, new Set(hiddenRef.current)).then(async (rows) => {
      if (!mounted.current) return;
      vendorsRef.current = rows;
      setVendors(rows);
      setError("");
      const roster = await readLaneModels(controller.signal);
      if (!mounted.current) return;
      setLaneModels(roster);
      publishLaneModels(roster);
    }).catch((reason) => {
      if (!mounted.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (mounted.current) setLoading(false);
    });
  }, []);
  const hideRefusedModels = (0, import_react2.useCallback)(async () => {
    const current = vendorsRef.current;
    const table = getVerdicts();
    const hidden = {};
    const failures = [];
    for (const row of current) {
      if (row.visibleModelCount === 0) continue;
      try {
        const models = await readVendorModels(row.vendor.id);
        const doomed = doomedModelIds(row.vendor.id, models, table, isUnusable(row));
        if (doomed.length === 0) continue;
        const result = await setVendorModelsDisabled(row.vendor.id, doomed, true);
        if (result.error !== "") {
          failures.push(`${row.vendor.name}\uFF1A${result.error}`);
          continue;
        }
        hidden[row.vendor.id] = doomed;
      } catch (err) {
        failures.push(`${row.vendor.name}\uFF1A${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0 && Object.keys(hidden).length === 0) {
      throw new Error(failures.join("\uFF1B"));
    }
    return hidden;
  }, []);
  const runProbeBatch = (0, import_react2.useCallback)(async (targets, { sweeping: sweeping2 }) => {
    const port = await readGatewayPort();
    if (port === 0) {
      setSweepError("no-gateway");
      return;
    }
    if (targets.length === 0) {
      if (sweeping2) setSweepError("");
      return;
    }
    const controller = new AbortController();
    if (sweeping2) sweepRef.current = controller;
    if (sweeping2) {
      setSweeping(true);
      setSweepProgress({ done: 0, total: targets.length });
    }
    setSweepError("");
    const queue = targets.map((target) => ({ key: target.key, modelId: target.modelId }));
    try {
      const { error: sweepFailure } = await runSweep(port, queue, {
        signal: controller.signal,
        onProgress: (status) => {
          if (sweeping2) setSweepProgress({ done: status.done, total: status.total });
          recordProbes(status.results);
        }
      });
      await refreshReadings(true);
      if (mounted.current && sweeping2) setSweepError(sweepFailure);
    } finally {
      if (sweeping2) sweepRef.current = null;
    }
    if (mounted.current) refresh();
    if ((await readSwitch()).enabled) {
      try {
        const extra = await hideRefusedModels();
        if (Object.keys(extra).length > 0) {
          const state = await readSwitch();
          const merged = {};
          for (const [provider, ids] of Object.entries(state.hidden)) merged[provider] = [...ids];
          for (const [provider, ids] of Object.entries(extra)) {
            merged[provider] = [.../* @__PURE__ */ new Set([...merged[provider] ?? [], ...ids])];
          }
          await writeSwitch({ enabled: true, hidden: merged });
          if (mounted.current) refresh();
        }
      } catch {
      }
    }
  }, [refresh, hideRefusedModels]);
  const runSweep2 = (0, import_react2.useCallback)(async () => {
    if (sweepRef.current !== null) return;
    const current = vendorsRef.current;
    if (current.length === 0) return;
    const vendorModels = {};
    for (const row of current) {
      if (row.visibleModelCount === 0) continue;
      try {
        const models = await readVendorModels(row.vendor.id);
        vendorModels[row.vendor.id] = models.map((model) => ({
          id: model.id,
          name: model.name,
          disabled: model.disabled,
          dead: model.dead
        }));
      } catch {
      }
    }
    const stored = getCache();
    const table = { ...getVerdicts() };
    const targets = planSweep(
      laneModels.map((model) => ({
        id: model.id,
        name: model.name,
        availability: model.availability,
        availabilitySource: model.availabilitySource,
        detail: model.detail,
        probedAt: model.probedAt,
        hiddenByUser: model.hiddenByUser
      })),
      vendorModels,
      stored,
      table
    );
    await runProbeBatch(targets, { sweeping: true });
  }, [laneModels, runProbeBatch]);
  const probeTargets = (0, import_react2.useCallback)(async (targets) => {
    const unique = [...new Map(targets.map((target) => [target.key, target])).values()];
    if (unique.length === 0) return;
    const claim = (add) => {
      const keys = new Set(probingRef.current.keys);
      const groups = new Map(probingRef.current.groups);
      for (const target of unique) {
        if (add) keys.add(target.key);
        else keys.delete(target.key);
        if (target.provider === "") continue;
        const count = (groups.get(target.provider) ?? 0) + (add ? 1 : -1);
        if (count <= 0) groups.delete(target.provider);
        else groups.set(target.provider, count);
      }
      probingRef.current = { keys, groups };
      setProbingKeys(keys);
      setProbingGroups(new Set(groups.keys()));
    };
    claim(true);
    try {
      await runProbeBatch(unique, { sweeping: false });
    } finally {
      claim(false);
    }
  }, [runProbeBatch]);
  const probeGroup = (0, import_react2.useCallback)(async (provider, models, lane) => {
    await probeTargets(
      models.slice(0, MAX_SWEEP).map((model) => targetFor(provider, model.id, model.name, lane))
    );
  }, [probeTargets]);
  const stopSweep2 = (0, import_react2.useCallback)(() => {
    sweepRef.current?.abort();
  }, []);
  (0, import_react2.useEffect)(() => {
    mounted.current = true;
    refresh();
    void refreshReadings(true);
    void readSwitch().then((state) => {
      if (!mounted.current) return;
      setSwitchOn(state.enabled);
      hiddenRef.current = Object.keys(state.hidden);
    });
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      sweepRef.current?.abort();
    };
  }, [refresh]);
  const setSwitch = (0, import_react2.useCallback)(async (on) => {
    setSwitchPending(true);
    try {
      if (on) {
        const hidden = await hideRefusedModels();
        await writeSwitch({ enabled: true, hidden });
        setSwitchOn(true);
        hiddenRef.current = Object.keys(hidden);
      } else {
        const state = await readSwitch();
        const remaining = {};
        for (const [provider, ids] of Object.entries(state.hidden)) {
          const result = await setVendorModelsDisabled(provider, ids, false);
          if (result.error === "") continue;
          const retired = /retired|已移除|不支持此渠道/i.test(result.error);
          if (!retired) remaining[provider] = [...ids];
        }
        await writeSwitch({ enabled: false, hidden: remaining });
        setSwitchOn(false);
        hiddenRef.current = Object.keys(remaining);
      }
      refresh();
    } finally {
      setSwitchPending(false);
    }
  }, [refresh, hideRefusedModels]);
  return {
    vendors,
    laneModels,
    loading,
    error,
    switchOn,
    switchPending,
    refresh,
    setSwitch,
    verdicts,
    sweeping,
    sweepProgress,
    sweepError,
    runSweep: runSweep2,
    stopSweep: stopSweep2,
    probingKeys,
    probingGroups,
    probeTargets,
    probeGroup
  };
}
function isUnusable(row) {
  if (row.visibleModelCount === 0) return false;
  if (row.state === "closed" || row.state === "idle" || row.state === "unknown") return true;
  if (row.balance === null) return false;
  return row.balance <= 0;
}

// client/src/picker.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function shortUnit(unit) {
  switch (unit) {
    case "credits":
      return " cr";
    case "dollars":
      return "$";
    case "tokens":
      return " tk";
    case "quota":
      return "";
    default:
      return "";
  }
}
function groupTitle(id, name, t) {
  return id === "deepseek-account" ? t("picker.account") : name;
}
function VerdictDot({ tone }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `ms-picker-dot is-${tone}`, "aria-hidden": "true" });
}
function verdictFor(verdicts, provider, model) {
  const key = pickerProbeKey(provider, model);
  const direct = verdicts[key];
  if (direct !== void 0) return direct;
  if (!isLaneRoute(provider)) return void 0;
  for (const candidate of laneCacheKeys(verdicts, model)) {
    const row = verdicts[candidate];
    if (row !== void 0) return row;
  }
  return void 0;
}
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      className: `ms-picker-chevron ${open ? "is-open" : ""}`,
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 9l6 6 6-6" })
    }
  );
}
function Check() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.4",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 12.5l4.5 4.5L19 7.5" })
    }
  );
}
function ModelGlyph() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      className: "ms-picker-trigger-icon",
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "7.5", y: "7.5", width: "9", height: "9", rx: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10 3.8v2.2M14 3.8v2.2M10 18v2.2M14 18v2.2M3.8 10h2.2M3.8 14h2.2M18 10h2.2M18 14h2.2" })
      ]
    }
  );
}
function ProbeGlyph({ spinning }) {
  if (spinning === true) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "svg",
      {
        className: "ms-picker-probe-icon is-spinning",
        width: "12",
        height: "12",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2.4",
        strokeLinecap: "round",
        "aria-hidden": "true",
        focusable: "false",
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 4a8 8 0 1 0 8 8" })
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      className: "ms-picker-probe-icon",
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "3.2" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2.5v3.4M12 18.1v3.4M2.5 12h3.4M18.1 12h3.4" })
      ]
    }
  );
}
function ComposerModelPicker(props) {
  const { locked, available, directory, load, select, t } = props;
  const state = import_react3.default.useSyncExternalStore(
    (0, import_react3.useCallback)((fn) => directory.subscribe(fn), [directory]),
    (0, import_react3.useCallback)(() => directory.getSnapshot(), [directory])
  );
  const feature = useModelSelector();
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [query, setQuery] = (0, import_react3.useState)("");
  const [menuPos, setMenuPos] = (0, import_react3.useState)(null);
  const [error, setError] = (0, import_react3.useState)("");
  const rootRef = (0, import_react3.useRef)(null);
  const triggerRef = (0, import_react3.useRef)(null);
  const menuRef = (0, import_react3.useRef)(null);
  const searchRef = (0, import_react3.useRef)(null);
  const id = import_react3.default.useId();
  const groups = state.groups;
  const busy = state.pending !== null || state.status === "selecting";
  const current = state.current;
  const currentOption = (0, import_react3.useMemo)(() => {
    if (current === null) return void 0;
    for (const group of groups) {
      if (group.id !== current.provider) continue;
      const hit = group.models.find((model) => model.id === current.model);
      if (hit !== void 0) return { group, model: hit };
    }
    return void 0;
  }, [groups, current]);
  const currentReasoning = currentOption?.model.reasoning;
  const currentEffort = current?.reasoningEffort ?? currentReasoning?.defaultEffort;
  const choices = (0, import_react3.useMemo)(() => {
    const needle = query.trim().toLowerCase();
    const rows = [];
    for (const group of groups) {
      for (const model of group.models) {
        if (needle !== "" && !model.name.toLowerCase().includes(needle)) continue;
        const verdict = verdictFor(feature.verdicts, group.id, model.id);
        const state_ = verdict?.state;
        rows.push({
          groupId: group.id,
          groupName: groupTitle(group.id, group.name, t),
          model,
          tone: verdictTone(state_),
          title: state_ === void 0 || state_ === "unknown" ? t("picker.untested") : verdict?.detail !== void 0 && verdict.detail !== "" ? `${verdictLabel(state_, t)} \xB7 ${verdict.detail}` : verdictLabel(state_, t)
        });
      }
    }
    return rows;
  }, [groups, feature.verdicts, query, t]);
  const grouped = (0, import_react3.useMemo)(() => {
    const order = [];
    const byGroup = /* @__PURE__ */ new Map();
    for (const row of choices) {
      const bucket = byGroup.get(row.groupId);
      if (bucket === void 0) {
        order.push(row.groupId);
        byGroup.set(row.groupId, [row]);
        continue;
      }
      bucket.push(row);
    }
    return order.map((groupId) => byGroup.get(groupId));
  }, [choices]);
  const showSearch = groups.reduce((sum, group) => sum + group.models.length, 0) > 4;
  const vendorBalance = (0, import_react3.useMemo)(
    () => new Map(feature.vendors.map((v) => [v.vendor.id, { balance: v.balance, unit: v.vendor.unit }])),
    [feature.vendors]
  );
  (0, import_react3.useEffect)(() => {
    if (available && state.status === "idle") load();
  }, [available, state.status, load]);
  (0, import_react3.useLayoutEffect)(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect === void 0) return;
      const width = menuRef.current?.offsetWidth ?? 0;
      const height = menuRef.current?.offsetHeight ?? 0;
      let left = rect.right - width;
      let top = rect.top - 8 - height;
      if (width > 0) left = Math.min(Math.max(left, 12), window.innerWidth - width - 12);
      if (height > 0) top = Math.min(Math.max(top, 12), window.innerHeight - height - 12);
      setMenuPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, choices.length, state.status]);
  (0, import_react3.useEffect)(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (rootRef.current?.contains(event.target) === true) return;
      if (menuRef.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);
  (0, import_react3.useEffect)(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);
  const close = (0, import_react3.useCallback)((restoreFocus) => {
    setOpen(false);
    setQuery("");
    if (!restoreFocus) return;
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);
  const submit = (0, import_react3.useCallback)((selection) => {
    setError("");
    void select(selection).then((result) => {
      if (result === void 0) return;
      if (result.ok) {
        close(true);
        return;
      }
      const failure = result.error;
      setError(failure === void 0 ? t("picker.failed") : failure.code === "session/writer-held" ? t("picker.sessionInUse") : `${failure.code}: ${failure.message}`);
    });
  }, [select, close, t]);
  const choose = (0, import_react3.useCallback)((groupId, model) => {
    if (current?.provider === groupId && current.model === model.id) {
      close(true);
      return;
    }
    const effort = model.reasoning?.defaultEffort;
    submit({
      provider: groupId,
      model: model.id,
      ...effort === void 0 ? {} : { reasoningEffort: effort }
    });
  }, [current, submit, close]);
  const chooseEffort = (0, import_react3.useCallback)((effort) => {
    if (current === null) return;
    if (currentEffort === effort) {
      close(true);
      return;
    }
    submit({
      provider: current.provider,
      model: current.model,
      ...effort === void 0 ? {} : { reasoningEffort: effort }
    });
  }, [current, currentEffort, submit, close]);
  const onKeyDown = (0, import_react3.useCallback)((event) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    close(true);
  }, [open, close]);
  if (!available) return null;
  const waiting = current === null && state.status === "loading";
  const label = waiting ? t("picker.loading") : currentOption?.model.name ?? (current === null ? t("picker.placeholder") : `${current.provider}/${current.model}`);
  const effortName = currentReasoning === void 0 ? void 0 : currentEffort === void 0 ? t("picker.providerDefault") : currentReasoning.efforts.find((level) => level.id === currentEffort)?.name ?? currentEffort;
  const triggerTone = current === null ? verdictTone(void 0) : verdictTone(feature.verdicts[pickerProbeKey(current.provider, current.model)]?.state);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-root", ref: rootRef, onKeyDown, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        ref: triggerRef,
        type: "button",
        className: "ms-picker-trigger",
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-controls": open ? `${id}-menu` : void 0,
        title: current === null ? t("picker.open") : `${label}${effortName === void 0 ? "" : ` \xB7 ${effortName}`}`,
        disabled: locked,
        onClick: () => {
          if (open) {
            close(true);
            return;
          }
          setError("");
          setOpen(true);
          load();
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VerdictDot, { tone: triggerTone }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelGlyph, {}),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ms-picker-label", children: label }),
          effortName !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ms-picker-effort", children: effortName }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chevron, { open })
        ]
      }
    ),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          ref: menuRef,
          id: `${id}-menu`,
          className: "ms-picker-menu",
          style: menuPos ?? { visibility: "hidden", left: 0, top: 0 },
          role: "dialog",
          "aria-label": t("picker.menu"),
          onKeyDown,
          children: [
            showSearch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                ref: searchRef,
                className: "ms-picker-search",
                type: "search",
                value: query,
                placeholder: t("picker.search"),
                "aria-label": t("picker.search"),
                onChange: (event) => setQuery(event.target.value)
              }
            ),
            state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note", children: t("picker.loading") }),
            state.error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-note is-error", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("picker.groupFailed", { name: t("picker.menu"), message: state.error }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "ms-picker-retry", onClick: load, children: t("picker.retry") })
            ] }),
            error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note is-error", children: error }),
            feature.error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note is-warning", children: feature.error }),
            state.failures.map((failure) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note is-warning", children: t("picker.groupFailed", { name: groupTitle(failure.id, failure.name, t), message: failure.message }) }, failure.id)),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-list", role: "listbox", "aria-label": t("picker.menu"), children: [
              grouped.map((rows) => {
                const groupId = rows[0].groupId;
                const balanceInfo = vendorBalance.get(groupId);
                const balanceText = balanceInfo === void 0 || balanceInfo.balance === null ? "" : `${balanceInfo.balance}${shortUnit(balanceInfo.unit)}`;
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-group", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-group-name", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ms-picker-group-title", children: [
                      rows[0].groupName,
                      balanceText !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ms-picker-group-balance", children: balanceText })
                    ] }),
                    (() => {
                      const groupProbing = feature.probingGroups.has(groupId);
                      const groupTone = rows.some((row) => row.tone === "refused") ? "refused" : rows.some((row) => row.tone === "ok") ? "ok" : "unknown";
                      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "button",
                        {
                          type: "button",
                          className: `ms-picker-group-probe ${groupProbing ? "is-probing" : ""}`,
                          disabled: groupProbing,
                          title: groupProbing ? t("probe.groupRunning") : t("probe.group"),
                          "aria-label": t("probe.group"),
                          onClick: () => {
                            void feature.probeGroup(
                              groupId,
                              rows.map((row) => ({ id: row.model.id, name: row.model.name })),
                              isLaneRoute(groupId)
                            );
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProbeGlyph, { spinning: groupProbing }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `ms-picker-group-probe-dot is-${groupTone}`, "aria-hidden": "true" })
                          ]
                        }
                      );
                    })()
                  ] }),
                  rows.map((row) => {
                    const selected = current?.provider === row.groupId && current?.model === row.model.id;
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        className: `ms-picker-row-wrap ${selected ? "is-selected" : ""}`,
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                            "button",
                            {
                              type: "button",
                              role: "option",
                              "aria-selected": selected,
                              className: `ms-picker-row ${selected ? "is-selected" : ""}`,
                              title: row.title,
                              disabled: busy,
                              onClick: () => choose(row.groupId, row.model),
                              children: [
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VerdictDot, { tone: row.tone }),
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ms-picker-row-name", children: row.model.name }),
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ms-picker-row-check", children: selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : null })
                              ]
                            }
                          ),
                          (() => {
                            const key = pickerProbeKey(row.groupId, row.model.id);
                            const rowProbing = feature.probingKeys.has(key) || feature.probingGroups.has(row.groupId);
                            return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "button",
                              {
                                type: "button",
                                className: `ms-picker-row-probe ${rowProbing ? "is-probing" : ""}`,
                                disabled: rowProbing,
                                title: rowProbing ? t("probe.rowRunning") : t("probe.row"),
                                "aria-label": t("probe.row"),
                                onClick: () => {
                                  void feature.probeTargets([
                                    targetFor(row.groupId, row.model.id, row.model.name, isLaneRoute(row.groupId))
                                  ]);
                                },
                                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProbeGlyph, { spinning: rowProbing })
                              }
                            );
                          })()
                        ]
                      },
                      row.model.id
                    );
                  })
                ] }, groupId);
              }),
              state.status === "ready" && grouped.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note", children: groups.length === 0 ? t("picker.emptyModels") : t("picker.emptySearch") })
            ] }),
            currentReasoning !== void 0 && current !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-efforts", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-group-name", children: t("picker.effort") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-effort-row", children: [
                currentReasoning.defaultEffort === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: `ms-picker-effort-chip ${currentEffort === void 0 ? "is-selected" : ""}`,
                    disabled: busy,
                    onClick: () => chooseEffort(void 0),
                    children: t("picker.providerDefault")
                  }
                ),
                currentReasoning.efforts.map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: `ms-picker-effort-chip ${currentEffort === level.id ? "is-selected" : ""}`,
                    title: level.description ?? level.name,
                    disabled: busy,
                    onClick: () => chooseEffort(level.id),
                    children: level.name
                  },
                  level.id
                ))
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ms-picker-footer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: `ms-picker-footer-btn ${feature.switchOn ? "is-on" : ""}`,
                  disabled: feature.switchPending,
                  onClick: () => {
                    void feature.setSwitch(!feature.switchOn);
                  },
                  title: feature.switchOn ? t("switch.off") : t("switch.on"),
                  children: feature.switchOn ? t("picker.restore") : t("picker.clean")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "ms-picker-footer-btn",
                  disabled: feature.loading,
                  onClick: () => {
                    feature.refresh();
                  },
                  title: t("picker.refresh"),
                  children: t("picker.refresh")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: `ms-picker-footer-btn ${feature.sweeping ? "is-sweeping" : ""}`,
                  disabled: feature.sweeping || feature.switchPending,
                  onClick: feature.sweeping ? feature.stopSweep : () => {
                    void feature.runSweep();
                  },
                  title: feature.sweeping ? t("sweep.stop") : t("picker.probe"),
                  children: feature.sweeping ? `${feature.sweepProgress.done}/${feature.sweepProgress.total}` : t("picker.probe")
                }
              )
            ] }),
            feature.sweepError !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ms-picker-note is-error", children: t(`sweep.${feature.sweepError}`) })
          ]
        }
      ),
      document.body
    )
  ] });
}

// client/src/seat-face.ts
var PENDING = Object.freeze({
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: "loading",
  pending: null,
  error: null
});
var RETRY_DELAY_MS = 400;
var RETRY_ATTEMPTS = 25;
var DeferredDirectory = class {
  real;
  listeners = /* @__PURE__ */ new Set();
  detachReal;
  /** Adopt the real store and re-notify everyone that mounted before it. */
  attach(real) {
    if (this.real !== void 0) return;
    this.real = real;
    this.detachReal = real.subscribe(() => this.notify());
    this.notify();
  }
  getSnapshot() {
    return this.real?.getSnapshot() ?? PENDING;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /** Stop listening to the adopted store. */
  dispose() {
    this.detachReal?.();
    this.detachReal = void 0;
    this.listeners.clear();
    this.real = void 0;
  }
  notify() {
    for (const listener of [...this.listeners]) listener();
  }
};
function windowSchedule(run, delayMs) {
  return window.setTimeout(run, delayMs);
}
function cancelSchedule(handle) {
  if (handle === void 0 || handle === null) return;
  if (typeof window !== "undefined") window.clearTimeout(handle);
}
function createSeatFace(options) {
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const retryAttempts = options.retryAttempts ?? RETRY_ATTEMPTS;
  const schedule = options.schedule ?? windowSchedule;
  const directory = new DeferredDirectory();
  let resolved;
  let pendingLoad = false;
  let disposed = false;
  let attempts = 0;
  let timer;
  const attempt = () => {
    if (disposed || resolved !== void 0) return;
    attempts += 1;
    try {
      const next = options.resolve();
      resolved = next;
      directory.attach(next.store);
      if (pendingLoad) {
        pendingLoad = false;
        next.load().catch(() => {
        });
      }
      return;
    } catch {
      resolved = void 0;
    }
    if (attempts >= retryAttempts) return;
    timer = schedule(attempt, retryDelayMs);
  };
  attempt();
  return {
    available: options.available,
    directory,
    load: () => {
      if (!options.available) return;
      if (resolved === void 0) {
        pendingLoad = true;
        return;
      }
      resolved.load().catch(() => {
      });
    },
    select: (selection) => {
      if (!options.available || resolved === void 0) return Promise.resolve(void 0);
      return resolved.select(selection);
    },
    // The seat unmounts with its session; the retry and the adopted store's
    // subscription both stop here so a retired binding leaves nothing running.
    dispose: () => {
      disposed = true;
      cancelSchedule(timer);
      timer = void 0;
      directory.dispose();
      resolved = void 0;
    }
  };
}

// client/src/styles.ts
var CSS = `
/* \u2500\u2500 the composer model list \u2500\u2500 */
.ms-picker-root {
  position: relative;
  min-width: 0;
  max-width: min(360px, 45cqw);
}
.ms-picker-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: 0 0;
  outline: none;
  color: var(--dsw-alias-label-secondary, #667085);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  cursor: pointer;
}
.ms-picker-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-trigger:disabled {
  color: var(--dsw-alias-label-dimmed, #98a2b3);
  cursor: default;
}
.ms-picker-label {
  display: var(--dsh-composer-model-text-display, block);
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/*
 * A narrow composer gives the model seat no room for a name. The shell's
 * control row measures itself and marks that moment with data-model-compact,
 * published as a pair of inherited custom properties; the native seat answers
 * it by trading the model name for a glyph. Honoring the same two properties
 * is what makes this seat collapse on exactly the same frame as the native
 * one, instead of pushing the whole row onto a second line.
 */
.ms-picker-effort {
  display: var(--dsh-composer-model-text-display, block);
  overflow: hidden;
  min-width: 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1000;
}
.ms-picker-trigger-icon {
  display: var(--dsh-composer-model-icon-display, none);
  flex: none;
  color: var(--dsw-alias-label-tertiary, #98a2b3);
}
.ms-picker-chevron {
  flex: none;
  color: var(--dsw-alias-label-caption, #98a2b3);
  transition: transform 120ms;
}
.ms-picker-chevron.is-open {
  transform: rotate(180deg);
}
/*
 * The verdict dot. Its colour is the whole message at 6 px, and the hit area
 * around it is inert: the row is the button, not the dot.
 */
.ms-picker-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: currentColor;
}
.ms-picker-dot.is-ok {
  color: var(--dsw-alias-state-success-primary, #12b76a);
  background: var(--dsw-alias-state-success-primary, #12b76a);
}
.ms-picker-dot.is-refused {
  color: var(--dsw-alias-state-error-primary, #f04438);
  background: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-dot.is-unknown {
  color: var(--dsw-alias-label-caption, #98a2b3);
  background: var(--dsw-alias-label-caption, #98a2b3);
  opacity: 0.5;
}
.ms-picker-menu {
  position: fixed;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max-content;
  min-width: min(260px, 100vw - 32px);
  max-width: min(440px, 100vw - 32px);
  max-height: min(440px, 60vh);
  padding: 6px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-elevation-menu, 0 12px 32px rgba(0, 0, 0, 0.24));
  color: var(--dsw-alias-label-primary, #101828);
  font-size: 13px;
}
.ms-picker-search {
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font: inherit;
  outline: none;
}
.ms-picker-list {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}
.ms-picker-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: 0 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ms-picker-row:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-row:disabled {
  opacity: 0.6;
  cursor: default;
}
/* the wrapper owns the paint now; the row itself only draws its content */
.ms-picker-row-name {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-picker-row-check {
  display: flex;
  align-items: center;
  margin-left: auto;
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-note {
  padding: 6px 8px;
  color: var(--dsw-alias-label-caption, #98a2b3);
  font-size: 12px;
}
.ms-picker-note.is-error {
  display: flex;
  color: var(--dsw-alias-state-error-primary, #f04438);
  align-items: center;
  gap: 8px;
}
.ms-picker-note.is-warning {
  color: var(--dsw-alias-state-warning-primary, #f79009);
}
/*
 * Sticky group header: the vendor name stays pinned while its models scroll,
 * mirroring the native model list's section headers. The balance rides beside
 * it, so the user still knows whose credit they are looking at after scrolling
 * a few hundred rows.
 */
.ms-picker-group {
  position: relative;
}
.ms-picker-group-name {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 2px;
  color: var(--dsw-alias-label-caption, #98a2b3);
  font-size: 11px;
  font-weight: 600;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
}
.ms-picker-group-balance {
  margin-left: 10px;
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, #667085);
}
/*
 * The group's own probe control. It rides the sticky header so "ask this
 * vendor" is reachable wherever the user has scrolled to, and it doubles as
 * the vendor's status light: the dot mirrors the worst tone among the rows,
 * so a vendor whose models are all refused reads red without opening anyone's
 * tooltip.
 */
.ms-picker-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ms-picker-group-probe {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: 8px;
  padding: 2px 5px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: 0 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  cursor: pointer;
}
.ms-picker-group-probe:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  color: var(--dsw-alias-label-secondary, #667085);
}
.ms-picker-group-probe:disabled {
  cursor: default;
  opacity: 0.75;
}
.ms-picker-group-probe-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.ms-picker-group-probe-dot.is-ok {
  color: var(--dsw-alias-state-success-primary, #12b76a);
}
.ms-picker-group-probe-dot.is-refused {
  color: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-group-probe-dot.is-unknown {
  color: var(--dsw-alias-label-caption, #98a2b3);
  opacity: 0.5;
}

/*
 * A row is now two sibling controls (choose / probe), not one: a button
 * inside a button is invalid, and the probe must not also switch the model.
 * The wrapper owns the hover and selection paint so the pair reads as one row.
 */
.ms-picker-row-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}
.ms-picker-row-wrap:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.ms-picker-row-wrap.is-selected {
  background: var(--dsw-alias-interactive-bg-selected, rgba(77, 107, 254, 0.12));
}
.ms-picker-row-wrap.is-selected:hover {
  background: var(--dsw-alias-interactive-bg-selected, rgba(77, 107, 254, 0.12));
}
.ms-picker-row-probe {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background: 0 0;
  color: var(--dsw-alias-label-caption, #98a2b3);
  cursor: pointer;
  opacity: 0;
}
/*
 * The probe affordance stays invisible until the row is hovered or focused:
 * 57 rows each carrying a permanent button is a wall of glyphs, and the
 * feature's job is the verdict, not the control.
 */
.ms-picker-row-wrap:hover .ms-picker-row-probe,
.ms-picker-row-wrap:focus-within .ms-picker-row-probe,
.ms-picker-row-probe.is-probing {
  opacity: 1;
}
.ms-picker-row-probe:hover:not(:disabled) {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-row-probe:disabled {
  cursor: default;
}
.ms-picker-probe-icon.is-spinning {
  animation: ms-picker-spin 700ms linear infinite;
}
@keyframes ms-picker-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
/*
 * Footer bar holding the cleanup switch, refresh and probe buttons, so the
 * picker is the single place where both the readings and the controls live.
 */
.ms-picker-footer {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}
.ms-picker-footer-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #101828);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ms-picker-footer-btn:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.28));
}
.ms-picker-footer-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.ms-picker-footer-btn.is-on {
  border-color: var(--dsw-alias-state-error-primary, #f04438);
  color: var(--dsw-alias-state-error-primary, #f04438);
}
.ms-picker-footer-btn.is-sweeping {
  border-color: var(--dsw-alias-state-warning-primary, #f79009);
  color: var(--dsw-alias-state-warning-primary, #f79009);
}
.ms-picker-retry {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: 0 0;
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ms-picker-efforts {
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.1));
  padding-top: 2px;
}
.ms-picker-effort-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 8px 6px;
}
.ms-picker-effort-chip {
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.16));
  border-radius: 999px;
  background: 0 0;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.ms-picker-effort-chip.is-selected {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.ms-picker-effort-chip:disabled {
  opacity: 0.6;
  cursor: default;
}
`;

// client/src/index.tsx
var NS = "modelSelector";
var DICT = {
  zh: {
    "picker.menu": "\u6A21\u578B",
    "picker.open": "\u9009\u62E9\u6A21\u578B",
    "picker.account": "DeepSeek \u8D26\u53F7",
    "picker.loading": "\u8BFB\u53D6\u4E2D\u2026",
    "picker.placeholder": "\u9009\u62E9\u6A21\u578B",
    "picker.search": "\u641C\u7D22\u6A21\u578B",
    "picker.emptyModels": "\u6CA1\u6709\u8BFB\u5230\u6A21\u578B\u6E05\u5355\u3002",
    "picker.emptySearch": "\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B\u3002",
    "picker.untested": "\u672A\u63A2\u6D4B\uFF1A\u53EF\u7528\u6027\u8FD8\u4E0D\u77E5\u9053",
    "picker.effort": "\u601D\u8003\u5F3A\u5EA6",
    "picker.providerDefault": "\u8DDF\u968F\u6A21\u578B\u9ED8\u8BA4",
    "picker.groupFailed": "{name} \u8BFB\u53D6\u5931\u8D25\uFF1A{message}",
    "picker.failed": "\u5207\u6362\u6A21\u578B\u5931\u8D25",
    "picker.sessionInUse": "\u8FD9\u4E2A\u4F1A\u8BDD\u6B63\u5728\u5199\u5165\uFF0C\u7A0D\u540E\u518D\u5207\u6362\u6A21\u578B",
    "picker.retry": "\u91CD\u8BD5",
    "picker.clean": "\u6E05\u7406\u4E0D\u53EF\u7528",
    "picker.restore": "\u6062\u590D\u9690\u85CF",
    "picker.refresh": "\u5237\u65B0",
    "picker.probe": "\u63A2\u6D4B\u672A\u9A8C\u8BC1",
    "probe.row": "\u63A2\u6D4B\u8FD9\u4E2A\u6A21\u578B",
    "probe.rowRunning": "\u6B63\u5728\u63A2\u6D4B\u8FD9\u4E2A\u6A21\u578B\u2026",
    "probe.group": "\u63A2\u6D4B\u8FD9\u5BB6\u5382\u5546\u7684\u5168\u90E8\u6A21\u578B",
    "probe.groupRunning": "\u6B63\u5728\u63A2\u6D4B\u8FD9\u5BB6\u5382\u5546\u2026",
    "switch.on": "\u9690\u85CF\u4E0D\u53EF\u7528\u5382\u5546\u7684\u6A21\u578B\uFF0C\u8BA9\u6A21\u578B\u6E05\u5355\u6E05\u723D\u4E00\u70B9",
    "switch.off": "\u628A\u4E4B\u524D\u9690\u85CF\u7684\u6A21\u578B\u653E\u56DE\u6A21\u578B\u6E05\u5355",
    "model.available": "\u53EF\u7528",
    "model.regionBlocked": "\u5730\u533A\u9650\u5236",
    "model.unavailable": "\u4E0D\u53EF\u7528",
    "model.throttled": "\u9650\u6D41",
    "model.noCredit": "\u65E0\u989D\u5EA6",
    "model.noCredential": "\u672A\u767B\u5F55",
    "model.untested": "\u672A\u63A2\u6D4B",
    "sweep.stop": "\u505C\u6B62\u63A2\u6D4B",
    "sweep.no-gateway": "\u672C\u673A\u6CA1\u6709\u53EF\u7528\u7684\u6E20\u9053\u7F51\u5173\uFF0C\u65E0\u6CD5\u63A2\u6D4B\u3002",
    "sweep.no-gateway-key": "\u8BFB\u4E0D\u5230\u6E20\u9053\u7F51\u5173\u5BC6\u94A5\uFF0C\u65E0\u6CD5\u63A2\u6D4B\u3002",
    "sweep.sweep-request-failed": "\u63A2\u6D4B\u8BF7\u6C42\u6CA1\u9001\u51FA\u53BB\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002"
  },
  en: {
    "picker.menu": "Model",
    "picker.open": "Select a model",
    "picker.account": "DeepSeek account",
    "picker.loading": "Reading\u2026",
    "picker.placeholder": "Select a model",
    "picker.search": "Search models",
    "picker.emptyModels": "No model roster was read.",
    "picker.emptySearch": "No model matches.",
    "picker.untested": "Untested: availability is not known yet",
    "picker.effort": "Thinking effort",
    "picker.providerDefault": "Model default",
    "picker.groupFailed": "{name} failed to load: {message}",
    "picker.failed": "Could not switch models",
    "picker.sessionInUse": "This session is busy writing; try switching models in a moment",
    "picker.retry": "Retry",
    "picker.clean": "Clean up unusable models",
    "picker.restore": "Restore hidden models",
    "picker.refresh": "Refresh",
    "picker.probe": "Probe untested models",
    "probe.row": "Probe this model",
    "probe.rowRunning": "Probing this model\u2026",
    "probe.group": "Probe every model of this vendor",
    "probe.groupRunning": "Probing this vendor\u2026",
    "switch.on": "Hide unusable vendors' models, so the model list gets shorter",
    "switch.off": "Put the hidden models back into the model list",
    "model.available": "Available",
    "model.regionBlocked": "Region blocked",
    "model.unavailable": "Unavailable",
    "model.throttled": "Throttled",
    "model.noCredit": "No credit",
    "model.noCredential": "Not signed in",
    "model.untested": "Untested",
    "sweep.stop": "Stop probing",
    "sweep.no-gateway": "No channel gateway on this host, so probing is unavailable.",
    "sweep.no-gateway-key": "The gateway key could not be read, so probing is unavailable.",
    "sweep.sweep-request-failed": "The probe request did not reach the Host; try again."
  }
};
var inject = ["slots", "locale", "remote", "remote.session"];
function apply(ctx) {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), "model-selector: dictionaries");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-plugin", "dsh-model-selector");
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "model-selector: styles");
  ctx.inject(["slots", "modelDirectories", "sessions", "remote", "remote.session"], (scope) => {
    const models = scope.modelDirectories;
    const sessions = scope.sessions;
    scope.slots.inject("conversation.input.model", () => scope.slots.register({
      name: "conversation.input.model",
      priority: -200,
      locale: NS,
      inject: (sessionId) => {
        const available = sessions.subagentAddress(sessionId) === void 0;
        return createSeatFace({
          available,
          resolve: () => models.directoryFor(sessionId)
        });
      }
    }, ComposerModelPicker));
  });
}

		return module.exports;
	}
});
