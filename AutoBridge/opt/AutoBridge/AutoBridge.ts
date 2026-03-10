// GM61 AutoBridge Version 4.0000
// Multi-location polling + global resend + multi-file upload (additionalFiles)
//
// Run (testing):
// deno run --allow-read --allow-net --allow-env --allow-write --allow-run --unstable-kv AutoBridge.ts
//
// Compile (Mac):
// deno compile --allow-read --allow-net --allow-env --allow-write --unstable-kv --allow-run --output washer-uploader AutoBridge.ts
//
// Compile (Windows):
// deno compile --allow-read --allow-net --allow-env --allow-write --unstable-kv --allow-run --target x86_64-pc-windows-msvc --no-check --output GM61-AutoBridge.exe AutoBridge.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { ensureDir, exists } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { basename, extname, join } from "https://deno.land/std@0.224.0/path/mod.ts";

type Mode = "root" | "subfolder";
type WasherNameSource = "folder" | "filename" | "xml" | "fixed";

type GlobalConfig = {
  pollIntervalSeconds: number;
  startDate?: string;
  removeSpaces: boolean;
  removeHashtags: boolean;
  maxRetries: number;
  xmlTagDefault: string;
  fileExtensions: string[];
  resendFolder: string;
  fileStabilityWaitMs?: number;
};

type WasherNameConfig =
  | { source: "folder" }
  | { source: "xml"; xmlTag?: string }
  | { source: "filename"; regex?: string }
  | { source: "fixed"; value: string };

type MultiFileConfig = {
  enabled: boolean;
  groupKeyRegex?: string;      // extracts cycleKey (prefer named group (?<cycleKey>...))
  requiredCount?: number;      // number of files required to upload as one unit
  waitForGroupSeconds?: number;
  primaryFileRegex?: string;   // which file becomes primary "file"
};

type OnSuccessMoveConfig = {
  enabled: boolean;
  destination: string;
};

type LocationConfig = {
  id: string;
  watchFolder: string;
  mode: Mode;
  machineCode: string;
  washerName: WasherNameConfig;
  multiFile?: MultiFileConfig;
  onSuccessMove?: OnSuccessMoveConfig;
};

type AppConfig = {
  global: GlobalConfig;
  locations: LocationConfig[];
};

const CONFIG_PATH = Deno.env.get("CONFIG_PATH") || "./AutoBridge.config.json";
const API_URL = Deno.env.get("API_URL")!;
const AUTH_URL = Deno.env.get("AUTH_URL")!;
const AUTH_USERNAME = Deno.env.get("AUTH_USERNAME")!;
const AUTH_PASSWORD = Deno.env.get("AUTH_PASSWORD")!;
const LOG_DIR = Deno.env.get("LOG_DIR") || "./logs";

if (!API_URL || !AUTH_URL || !AUTH_USERNAME || !AUTH_PASSWORD) {
  console.error("Missing required env vars: API_URL, AUTH_URL, AUTH_USERNAME, AUTH_PASSWORD");
  Deno.exit(1);
}

await ensureDir(LOG_DIR);

const db = await Deno.openKv(join(LOG_DIR, "processed_files.db"));

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function writeLog(message: string) {
  try {
    const dateStr = new Date().toISOString().split("T")[0];
    const dailyLogPath = join(LOG_DIR, `log_${dateStr}.log`);
    const timestamp = new Date().toISOString();
    await Deno.writeTextFile(dailyLogPath, `[${timestamp}] ${message}\n`, { append: true });
  } catch (err) {
    console.error("Logging failed:", err);
  }
}

function normalizeSerial(serial: string, removeSpaces: boolean, removeHashtags: boolean) {
  let out = serial ?? "";
  if (removeSpaces) out = out.replace(/\s+/g, "");
  if (removeHashtags) out = out.replace(/#/g, "");
  return out;
}

async function isFileStable(path: string, waitMs: number): Promise<boolean> {
  try {
    const a = await Deno.stat(path);
    await new Promise((r) => setTimeout(r, waitMs));
    const b = await Deno.stat(path);
    const aM = a.mtime?.getTime() ?? 0;
    const bM = b.mtime?.getTime() ?? 0;
    return a.size === b.size && aM === bM;
  } catch {
    return false;
  }
}

async function safeMove(src: string, dest: string) {
  const destDir = dest.substring(0, dest.lastIndexOf("/") > -1 ? dest.lastIndexOf("/") : dest.length);
  if (destDir) await ensureDir(destDir);

  try {
    await Deno.rename(src, dest);
  } catch {
    await Deno.copyFile(src, dest);
    await Deno.remove(src);
  }
}

async function getAuthToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && tokenExpiry && now < tokenExpiry) return cachedToken;

  const resp = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: AUTH_USERNAME, password: AUTH_PASSWORD }),
  });

  if (!resp.ok) {
    await writeLog(`Auth failed: ${resp.status} ${resp.statusText}`);
    return null;
  }

  const data = await resp.json();
  const accessToken = data?.data?.access_token;
  if (!accessToken) {
    await writeLog("Auth response missing data.access_token");
    return null;
  }

  cachedToken = `Bearer ${accessToken}`;
  const decodedPayload = JSON.parse(atob(accessToken.split(".")[1]));
  tokenExpiry = decodedPayload.exp * 1000;

  await writeLog(`Auth ok. Token cached until ${new Date(tokenExpiry).toISOString()}`);
  return cachedToken;
}

async function extractWasherName(
  loc: LocationConfig,
  global: GlobalConfig,
  filePath: string,
  folderName: string | null,
): Promise<string> {
  const cfg = loc.washerName;

  if (cfg.source === "fixed") return cfg.value;
  if (cfg.source === "folder") return folderName ?? "UNKNOWN";

  if (cfg.source === "filename") {
    const fn = basename(filePath);
    if (cfg.regex) {
      const rx = new RegExp(cfg.regex);
      const m = fn.match(rx);
      if (m?.groups?.washer) return m.groups.washer;
      if (m && m[1]) return m[1];
    }
    return fn.replace(extname(fn), "");
  }

  // xml
  const tag = cfg.xmlTag || global.xmlTagDefault;
  const xmlText = await Deno.readTextFile(filePath);
  const machMatch = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  if (machMatch && machMatch[1]) return machMatch[1].trim();

  await writeLog(`[${loc.id}] ${tag} not found in ${filePath}`);
  return "UNKNOWN";
}

/**
 * Encode resend filename so we can restore context:
 *   <locId>__<washerName>__<originalFileName>
 * We also return originalFileName for restoring on success.
 */
function encodeResendName(locId: string, washerName: string, originalFileName: string) {
  const safeWasher = washerName.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${locId}__${safeWasher}__${originalFileName}`;
}

function tryParseResendName(fileName: string) {
  // locId__washer__original
  const parts = fileName.split("__");
  if (parts.length < 3) return null;
  const locId = parts[0];
  const washer = parts[1];
  const original = parts.slice(2).join("__"); // in case original had "__"
  return { locId, washer, original };
}

type FileItem = { path: string; name: string; folderName: string | null };

async function listCandidateFiles(loc: LocationConfig, global: GlobalConfig, rootPath: string): Promise<FileItem[]> {
  const res: FileItem[] = [];
  const startDate = global.startDate ? new Date(global.startDate) : null;
  const exts = new Set(global.fileExtensions.map((e) => e.toLowerCase()));

  if (loc.mode === "subfolder") {
    for await (const f of Deno.readDir(rootPath)) {
      if (!f.isDirectory) continue;
      const washerFolder = f.name;
      const washerPath = join(rootPath, washerFolder);

      for await (const entry of Deno.readDir(washerPath)) {
        if (!entry.isFile) continue;
        const ext = extname(entry.name).toLowerCase();
        if (!exts.has(ext)) continue;

        const full = join(washerPath, entry.name);
        const st = await Deno.stat(full);
        const created = st.birthtime ?? st.mtime;
        if (startDate && created && created < startDate) continue;

        res.push({ path: full, name: entry.name, folderName: washerFolder });
      }
    }
  } else {
    for await (const entry of Deno.readDir(rootPath)) {
      if (!entry.isFile) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!exts.has(ext)) continue;

      const full = join(rootPath, entry.name);
      const st = await Deno.stat(full);
      const created = st.birthtime ?? st.mtime;
      if (startDate && created && created < startDate) continue;

      res.push({ path: full, name: entry.name, folderName: null });
    }
  }

  return res;
}

async function alreadyProcessed(locId: string, filePath: string): Promise<boolean> {
  const key = ["processed_files", locId, filePath] as const;
  const v = await db.get(key);
  return !!v.value;
}

async function markProcessed(locId: string, filePath: string, status: string, extra?: Record<string, unknown>) {
  const key = ["processed_files", locId, filePath] as const;
  const st = await Deno.stat(filePath).catch(() => null);
  await db.set(key, {
    path: filePath,
    status,
    size: st?.size ?? null,
    mtime: st?.mtime?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

function groupFilesIfEnabled(loc: LocationConfig, files: FileItem[]) {
  const mf = loc.multiFile;
  if (!mf?.enabled || !mf.groupKeyRegex) {
    return { groups: files.map((f) => ({ key: f.name, items: [f] })), pending: [] as string[] };
  }

  const rx = new RegExp(mf.groupKeyRegex, "i");
  const required = mf.requiredCount ?? 2;

  const map = new Map<string, FileItem[]>();
  for (const f of files) {
    const m = f.name.match(rx);
    const key = m?.groups?.cycleKey || (m && m[1]) || null;
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  const groups: { key: string; items: FileItem[] }[] = [];
  const pending: string[] = [];

  for (const [key, items] of map.entries()) {
    if (items.length >= required) {
      groups.push({ key, items });
    } else {
      pending.push(`${key}(${items.length}/${required})`);
    }
  }

  return { groups, pending };
}

function choosePrimaryAndAdditional(loc: LocationConfig, items: FileItem[]) {
  const mf = loc.multiFile;
  if (!mf?.enabled || items.length <= 1) return { primary: items[0], additional: items.slice(1) };

  const primaryRx = mf.primaryFileRegex ? new RegExp(mf.primaryFileRegex, "i") : null;
  let primary = items[0];

  if (primaryRx) {
    const match = items.find((i) => primaryRx.test(i.name));
    if (match) primary = match;
  }

  const additional = items.filter((i) => i.path !== primary.path);
  return { primary, additional };
}

async function uploadFiles(
  loc: LocationConfig,
  global: GlobalConfig,
  primary: FileItem,
  additional: FileItem[],
  washerNameOverride?: string,
): Promise<boolean> {
  const stableWait = global.fileStabilityWaitMs ?? 750;

  const allToCheck = [primary, ...additional];
  for (const f of allToCheck) {
    const ok = await isFileStable(f.path, stableWait);
    if (!ok) {
      await writeLog(`[${loc.id}] File not stable yet: ${f.path}`);
      return false;
    }
  }

  const token = await getAuthToken();
  if (!token) return false;

  const washerName = washerNameOverride ??
    await extractWasherName(loc, global, primary.path, primary.folderName);

  const serial = normalizeSerial(washerName, global.removeSpaces, global.removeHashtags);
  const machineCode = `${loc.machineCode}-${serial}`;

  let attempt = 0;
  let success = false;

  while (attempt < global.maxRetries && !success) {
    attempt++;

    try {
      const fd = new FormData();

      // Primary
      const primaryBytes = await Deno.readFile(primary.path);
      fd.append("file", new Blob([primaryBytes]), primary.name);

      // Additional (repeat key)
      for (const a of additional) {
        const bytes = await Deno.readFile(a.path);
        fd.append("additionalFiles", new Blob([bytes]), a.name);
      }

      fd.append("machineCode", machineCode);
      fd.append("machineSerial", serial);

      await writeLog(
        `[${loc.id}] Attempt ${attempt}: Upload primary=${primary.name} additional=${additional.map((x) => x.name).join(",")} machineCode=${machineCode}`,
      );

      const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "authorization": token },
        body: fd,
      });

      const contentType = resp.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await resp.json() : await resp.text();

      if (!resp.ok) {
        const msg = typeof body === "string" ? body : (body?.message ?? JSON.stringify(body));
        await writeLog(`[${loc.id}] Upload failed: HTTP ${resp.status} ${msg}`);
      } else {
        success = true;
      }
    } catch (err) {
      await writeLog(`[${loc.id}] Upload error: ${err}`);
    }

    if (!success && attempt < global.maxRetries) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return success;
}

async function moveOnSuccess(loc: LocationConfig, filePath: string, desiredName?: string) {
  const moveCfg = loc.onSuccessMove;
  if (!moveCfg?.enabled) return;

  await ensureDir(moveCfg.destination);
  const name = desiredName ?? basename(filePath);
  const dest = join(moveCfg.destination, name);
  await safeMove(filePath, dest);
  await writeLog(`[${loc.id}] Moved success file to: ${dest}`);
}

async function moveToResend(global: GlobalConfig, loc: LocationConfig, filePath: string, washerName: string) {
  await ensureDir(global.resendFolder);
  const originalName = basename(filePath);
  const resendName = encodeResendName(loc.id, washerName, originalName);
  const dest = join(global.resendFolder, resendName);
  await safeMove(filePath, dest);
  await writeLog(`[${loc.id}] Moved failed file to resend: ${dest}`);
}

async function processResendFolder(app: AppConfig) {
  const resend = app.global.resendFolder;
  await ensureDir(resend);

  const exts = new Set(app.global.fileExtensions.map((e) => e.toLowerCase()));

  // Collect resend files per location
  const byLoc = new Map<string, FileItem[]>();

  for await (const entry of Deno.readDir(resend)) {
    if (!entry.isFile) continue;

    const parsed = tryParseResendName(entry.name);
    if (!parsed) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!exts.has(ext)) continue;

    const full = join(resend, entry.name);
    const item: FileItem = { path: full, name: entry.name, folderName: null };

    if (!byLoc.has(parsed.locId)) byLoc.set(parsed.locId, []);
    byLoc.get(parsed.locId)!.push(item);
  }

  for (const [locId, items] of byLoc.entries()) {
    const loc = app.locations.find((l) => l.id === locId);
    if (!loc) {
      await writeLog(`[resend] Unknown location id "${locId}" for ${items.length} file(s).`);
      continue;
    }

    // Convert resend names back to "original" for grouping/primary selection
    // but we keep the actual resend path for IO
    const mapped = items.map((it) => {
      const p = tryParseResendName(it.name)!;
      return { ...it, name: p.original, _washer: p.washer, _locId: p.locId, _resendFullName: basename(it.path) } as any;
    });

    // Group using location multiFile rules (based on original filename)
    const { groups, pending } = groupFilesIfEnabled(loc, mapped);
    if (pending.length) await writeLog(`[${loc.id}] Resend pending groups: ${pending.join(", ")}`);

    for (const g of groups) {
      // Ensure group has enough members if multiFile is enabled
      const mf = loc.multiFile;
      const required = mf?.enabled ? (mf.requiredCount ?? 2) : 1;
      if (mf?.enabled && g.items.length < required) continue;

      const { primary, additional } = choosePrimaryAndAdditional(loc, g.items);
      const washerOverride = (primary as any)._washer as string;

      // Important: Upload uses "original names" for metadata but reads from resend paths
      const primaryReal: FileItem = { path: (primary as any).path, name: (primary as any).name, folderName: null };
      const additionalReal: FileItem[] = additional.map((a: any) => ({ path: a.path, name: a.name, folderName: null }));

      const ok = await uploadFiles(loc, app.global, primaryReal, additionalReal, washerOverride);

      // Mark and move outcomes
      for (const f of [primary, ...additional]) {
        await markProcessed(loc.id, (f as any).path, ok ? "success" : "failed", { resend: true });

        if (ok) {
          // Move to processed destination restoring original filename
          await moveOnSuccess(loc, (f as any).path, (f as any).name);
        } else {
          // Keep in resend
          await writeLog(`[${loc.id}] Resend failed, kept in resend: ${(f as any).path}`);
        }
      }
    }
  }
}

async function processLocation(app: AppConfig, loc: LocationConfig) {
  await ensureDir(loc.watchFolder);

  const candidates = await listCandidateFiles(loc, app.global, loc.watchFolder);
  const fresh: FileItem[] = [];
  for (const f of candidates) {
    if (await alreadyProcessed(loc.id, f.path)) continue;
    fresh.push(f);
  }

  // Group by cycle key if enabled (per location)
  const { groups, pending } = groupFilesIfEnabled(loc, fresh);
  if (pending.length) await writeLog(`[${loc.id}] Pending groups: ${pending.join(", ")}`);

  // If multiFile enabled, optionally wait for groups to form before giving up
  const mf = loc.multiFile;
  const required = mf?.enabled ? (mf.requiredCount ?? 2) : 1;

  for (const g of groups) {
    if (mf?.enabled && g.items.length < required) continue;

    const { primary, additional } = choosePrimaryAndAdditional(loc, g.items);

    // Washer name is determined once per upload (primary)
    const washerName = await extractWasherName(loc, app.global, primary.path, primary.folderName);

    const ok = await uploadFiles(loc, app.global, primary, additional);

    // Mark & move each file
    for (const f of [primary, ...additional]) {
      await markProcessed(loc.id, f.path, ok ? "success" : "failed", { groupKey: g.key });

      if (ok) {
        await moveOnSuccess(loc, f.path);
      } else {
        // Move each failed file to global resend with encoded name
        await moveToResend(app.global, loc, f.path, washerName);
      }
    }

    await writeLog(
      `[${loc.id}] Group ${g.key}: ${ok ? "SUCCESS" : "FAILED"} files=${[primary.name, ...additional.map((x) => x.name)].join(", ")}`,
    );
  }
}

async function loadConfig(): Promise<AppConfig> {
  if (!(await exists(CONFIG_PATH))) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }

  const raw = await Deno.readTextFile(CONFIG_PATH);
  const cfg = JSON.parse(raw) as AppConfig;

  if (!cfg.locations || cfg.locations.length === 0) {
    await writeLog("Config has no locations. AutoBridge will idle.");
  }
  if (cfg.locations && cfg.locations.length > 10) {
    throw new Error("Config has more than 10 locations (limit is 10).");
  }

  // Basic defaults/sanity
  cfg.global.fileStabilityWaitMs ??= 750;
  return cfg;
}

const app = await loadConfig();

await ensureDir(app.global.resendFolder);
await writeLog(`AutoBridge v4 started. Locations=${app.locations?.length ?? 0} Resend=${app.global.resendFolder}`);

const pollMs = (app.global.pollIntervalSeconds ?? 10) * 1000;

while (true) {
  try {
    // Resend first
    await processResendFolder(app);

    // Then each location
    for (const loc of app.locations ?? []) {
      try {
        await processLocation(app, loc);
      } catch (err) {
        await writeLog(`[${loc.id}] Location error: ${err}`);
      }
    }
  } catch (err) {
    await writeLog(`Main loop error: ${err}`);
  }

  await new Promise((r) => setTimeout(r, pollMs));
}

// Graceful shutdown
addEventListener("unload", () => db.close());