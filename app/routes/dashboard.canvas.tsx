/**
 * /dashboard/canvas — the strategy, alone, for export.
 *
 * The Canvas itself lives in the chat route now (inline at a decision, then as the main
 * column once the strategy is done) — that is where you read and revise it. This route is
 * not a second way to see the same thing: no chat rail, nothing but the artefact and the
 * download button, which is what the print stylesheet targets (UI-5). Nav only links here
 * once the strategy is complete (UI-4) — a nav item that opens an empty page is worse than
 * one that isn't there yet.
 */

import { CanvasPanel } from "../lib/CanvasPanel.tsx";
import { useConsultation } from "../lib/consultation.ts";
import { DownloadIcon } from "../lib/icons.tsx";

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
          <p className="text-lg font-medium text-slate-900">Your finished AI enablement strategy</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <DownloadIcon className="h-4 w-4" />
            Download strategy (PDF)
          </button>
        </div>
      )}
      {/* Nav only links here once complete, but a direct URL can still land mid-pipeline —
          the lifted "document" treatment is for the finished artifact (UI-12), not a
          work-in-progress view, so it's gated on `ready` the same as the button above. */}
      <div
        className={
          ready
            ? "rounded-xl bg-white p-8 shadow-sm print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
            : ""
        }
      >
        <CanvasPanel />
      </div>
    </main>
  );
}
