/**
 * /dashboard/canvas — the Canvas on its own.
 *
 * Not linked from anywhere any more: the Canvas comes to the user now, inline at a decision
 * and as the main column once the strategy is done. This route is the focused view, and the
 * page the print stylesheet will target (ARCHITECTURE.md §8.2 replacement).
 */

import { CanvasPanel } from "../lib/CanvasPanel.tsx";

export function meta() {
  return [{ title: "Strategy Canvas · enaible" }];
}

export default function Canvas() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
      <CanvasPanel />
    </main>
  );
}
