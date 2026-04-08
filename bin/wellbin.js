#!/usr/bin/env bun
/**
 * Global `wellbin` / `wellbin-code` entry. Must run with Bun — dist/cli.js is a Bun bundle.
 * (Windows `npm link` shims often invoke `node` on .js bins; pointing bin here + Bun shebang fixes that.)
 */
await import(new URL("../dist/cli.js", import.meta.url).href)
