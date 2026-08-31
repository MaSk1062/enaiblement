/**
 * /dashboard/canvas — the Canvas on its own.
 *
 * Not linked from anywhere any more: the Canvas comes to the user now, inline at a decision
 * and as the main column once the strategy is done. This route is the focused view, and the
 * page the print stylesheet targets (ARCHITECTURE.md §8.2 replacement, UI-5).
 */

import { CanvasPanel } from "../lib/CanvasPanel.tsx";
import { useConsultation } from "../lib/consultation.ts";

export function meta() {
  return [{ title: "Strategy Canvas · enaible" }];
}

export default function Canvas() {
  const { state } = useConsultation();
  const ready = state.currentStage === "complete";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8 print:overflow-visible">
      {ready && (
        <div className="mb-6 flex items-center justify-between print:hidden">
          <p className="text-sm text-slate-500">Your finished AI enablement strategy.</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Download strategy (PDF)
          </button>
        </div>
      )}
      <CanvasPanel />
    </main>
  );
}
