/**
 * The handover: the files the specialists produced.
 *
 * A consultation that ends in prose is a document. This is the part that is a deliverable —
 * diagrams, Terraform, manifests, a runbook, a scaffold — so it gets copy and download rather
 * than being something to read on a screen.
 *
 * Mermaid is imported dynamically, and only when a diagram is actually present, so a ~2MB
 * dependency never touches the first load of a chat that has no diagrams in it.
 */

import { useEffect, useRef, useState } from "react";
import type { Artifact } from "../types.ts";

export function Artifacts({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="space-y-3">
      {artifacts.map((artifact) => (
        <ArtifactCard key={artifact.path} artifact={artifact} />
      ))}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const isDiagram = artifact.language === "mermaid";
  const [showSource, setShowSource] = useState(!isDiagram);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([artifact.content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.path.split("/").pop() ?? "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-900">{artifact.path}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{artifact.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isDiagram && (
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {showSource ? "Diagram" : "Source"}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Download
          </button>
        </div>
      </header>

      {isDiagram && !showSource ? (
        <Diagram source={artifact.content} path={artifact.path} />
      ) : (
        <pre className="max-h-96 overflow-auto bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-800">
          <code>{artifact.content}</code>
        </pre>
      )}

      <p className="border-t border-slate-100 px-4 py-1.5 text-right text-xs text-slate-500">
        {artifact.producedBy}
      </p>
    </article>
  );
}

/** Renders one mermaid source. A parse failure shows the source and the error, never a blank box. */
function Diagram({ source, path }: { source: string; path: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        const id = `d${path.replace(/[^a-z0-9]/gi, "")}`;
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && host.current) host.current.innerHTML = svg;
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, path]);

  if (error) {
    return (
      <div>
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          This diagram did not parse, so here is the source. {error}
        </p>
        <pre className="max-h-96 overflow-auto bg-slate-50 px-4 py-3 text-xs text-slate-800">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return <div ref={host} className="overflow-auto bg-white px-4 py-4 [&_svg]:mx-auto" />;
}
