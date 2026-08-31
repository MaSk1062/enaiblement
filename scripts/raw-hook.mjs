/**
 * Teaches plain node the one Vite-ism the agents use: `import prompt from "./x.md?raw"`.
 *
 *   node --import ./scripts/raw-hook.mjs scripts/eval.ts
 *
 * Without this, no script outside the Vite build can import an agent module, and an eval that
 * cannot import the real agent is an eval of a copy of the agent. `module.registerHooks` is
 * stdlib and synchronous - no loader thread, no dependency, ~20 lines.
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const RAW = /\.md\?raw$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!RAW.test(specifier)) return nextResolve(specifier, context);
    return {
      url: new URL(specifier, context.parentURL).href,
      format: "module",
      shortCircuit: true,
    };
  },

  load(url, context, nextLoad) {
    if (!RAW.test(url)) return nextLoad(url, context);
    const text = readFileSync(fileURLToPath(url.replace("?raw", "")), "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  },
});
