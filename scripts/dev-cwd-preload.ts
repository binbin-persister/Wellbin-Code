/**
 * Preload for scripts/dev.ts: when dev is run from another folder, Bun's child
 * process cwd must be the claude-code repo root (for src/entrypoints/cli.tsx).
 * This restores the invoker's cwd before any module reads process.cwd().
 */
const target = process.env.WELLBIN_CODE_DEV_STARTUP_CWD;
if (target) {
  try {
    process.chdir(target);
  } catch {
    // ignore invalid paths
  }
}
