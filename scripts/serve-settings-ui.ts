#!/usr/bin/env bun
/**
 * Serves the static API settings configurator at http://localhost:9876
 */
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../web/settings-configurator");

const server = Bun.serve({
  port: 9876,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (pathname.includes("..")) {
      return new Response("Not found", { status: 404 });
    }
    const filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(normalize(root))) {
      return new Response("Not found", { status: 404 });
    }
    if (!existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(Bun.file(filePath));
  },
});

console.log(`Settings UI: http://localhost:${server.port}/`);
console.log(`Root: ${root}`);
