/**
 * Renders a Mermaid diagram string as SVG. UI-8 — held, not merged into dev.
 *
 * `ArchitectureStack` has no diagram field yet; `app/agents/architect.ts` doesn't emit one
 * (suggestions.md P2-1). This is built against FIXTURE_DIAGRAM below so the renderer exists
 * and is reviewable now — swapping the fixture for `architectureStack.diagram` (or whatever
 * he names it) is meant to be the only change needed once that field lands.
 *
 * Client-only on purpose: Mermaid measures text and lays out SVG in the browser, so this
 * renders after mount rather than during SSR.
 */

import { useEffect, useId, useRef, useState } from "react";

export function ArchitectureDiagram({ diagram }: { diagram: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = `architecture-diagram-${useId().replace(/:/g, "")}`;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "inherit" });
        const { svg } = await mermaid.render(renderId, diagram);
        if (!cancelled && containerRef.current) containerRef.current.innerHTML = svg;
      } catch {
        // A diagram that fails to parse (a live model output, eventually) should not take the
        // rest of the Canvas down with it.
        if (!cancelled) setError("Diagram could not be rendered.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [diagram, renderId]);

  if (error) {
    return <p className="text-xs text-slate-500">{error}</p>;
  }

  return <div ref={containerRef} className="overflow-x-auto [&_svg]:mx-auto" />;
}

/** Stand-in until architect.ts emits a real one. Shape matches what the stack section already shows. */
export const FIXTURE_DIAGRAM = `graph TD
  User[User] --> Frontend[React Frontend]
  Frontend --> API[API Layer]
  API --> LLM[Gemini 2.5 Pro]
  API --> RAG[Retrieval / Case Studies]
  API --> DB[(Firestore)]
  API --> Auth[Firebase Auth]
`;
