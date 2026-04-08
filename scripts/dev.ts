#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getMacroDefines } from "./defines.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
/** Caller cwd (e.g. another project); preload chdirs back before state init */
const devStartupCwd = process.cwd();

const defines = getMacroDefines();

const defineArgs = Object.entries(defines).flatMap(([k, v]) => [
    "-d",
    `${k}:${v}`,
]);

// Bun --feature flags: enable feature() gates at runtime.
// Default features enabled in dev mode.
const DEFAULT_FEATURES = ["BUDDY", "TRANSCRIPT_CLASSIFIER", "BRIDGE_MODE", "AGENT_TRIGGERS_REMOTE", "CHICAGO_MCP", "VOICE_MODE"];

// Any env var matching FEATURE_<NAME>=1 will also enable that feature.
// e.g. FEATURE_PROACTIVE=1 bun run dev
const envFeatures = Object.entries(process.env)
    .filter(([k]) => k.startsWith("FEATURE_"))
    .map(([k]) => k.replace("FEATURE_", ""));

const allFeatures = [...new Set([...DEFAULT_FEATURES, ...envFeatures])];
const featureArgs = allFeatures.flatMap((name) => ["--feature", name]);

// If BUN_INSPECT is set, pass --inspect-wait to the child process
const inspectArgs = process.env.BUN_INSPECT
    ? ["--inspect-wait=" + process.env.BUN_INSPECT]
    : [];

const preloadPath = join(__dirname, "dev-cwd-preload.ts");

// Use `bun` (not `bun run`) after --preload: `bun run` placement confuses some Bun versions on Windows.
const result = Bun.spawnSync(
    [
        "bun",
        ...inspectArgs,
        "--preload",
        preloadPath,
        ...defineArgs,
        ...featureArgs,
        "src/entrypoints/cli.tsx",
        ...process.argv.slice(2),
    ],
    {
        stdio: ["inherit", "inherit", "inherit"],
        cwd: repoRoot,
        env: {
            ...process.env,
            WELLBIN_CODE_DEV_STARTUP_CWD: devStartupCwd,
        },
    },
);

process.exit(result.exitCode ?? 0);
