#!/usr/bin/env python3
"""Render the enaible markdown docs to landscape A4 PDFs with inlined SVG figures."""
import os, re, subprocess, sys, html as _html
import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

CSS = """
@page { size: A4 landscape; margin: 14mm 16mm 16mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'Inter','Segoe UI',-apple-system,Helvetica,Arial,sans-serif;
  font-size: 10.2pt; line-height: 1.55; color: #1e293b; margin: 0;
}
.wrap { max-width: 205mm; margin: 0 auto; }
.full { max-width: none; }

/* cover */
.cover { height: 176mm; display: flex; flex-direction: column; justify-content: center;
         page-break-after: always; max-width: none; }
.cover .eyebrow { font-size: 10pt; letter-spacing: .16em; text-transform: uppercase;
                  color: #7c3aed; font-weight: 700; }
.cover h1 { font-size: 34pt; line-height: 1.08; margin: 10mm 0 4mm; letter-spacing: -.02em;
            color: #0f172a; border: 0; padding: 0; }
.cover .sub { font-size: 14.5pt; color: #475569; font-weight: 400; max-width: 215mm; }
.cover .rule { height: 4px; width: 64mm; background: linear-gradient(90deg,#7c3aed,#0d9488);
               margin: 9mm 0; border-radius: 2px; }
.cover dl { display: grid; grid-template-columns: 36mm 1fr; gap: 2.6mm 8mm;
            font-size: 10pt; margin: 0; max-width: 225mm; }
.cover dt { color: #94a3b8; font-weight: 600; text-transform: uppercase;
            letter-spacing: .06em; font-size: 8.4pt; padding-top: .6mm; }
.cover dd { margin: 0; color: #334155; font-weight: 500; }

h1 { font-size: 19pt; letter-spacing: -.015em; color: #0f172a; margin: 0 0 5mm;
     padding-bottom: 3mm; border-bottom: 2.5px solid #7c3aed; page-break-after: avoid; }
h2 { font-size: 14pt; margin: 9mm 0 3mm; color: #0f172a; letter-spacing: -.01em;
     page-break-after: avoid; padding-bottom: 1.6mm; border-bottom: 1px solid #e2e8f0; }
h3 { font-size: 11.4pt; margin: 6.5mm 0 2mm; color: #334155; page-break-after: avoid; }
h1 + h2 { margin-top: 4mm; }
p { margin: 0 0 3.2mm; }
strong { color: #0f172a; font-weight: 650; }
em { color: #475569; }
a { color: #7c3aed; text-decoration: none; }
hr { border: 0; border-top: 1px solid #e2e8f0; margin: 8mm 0; }

ul, ol { margin: 0 0 3.6mm; padding-left: 6mm; }
li { margin-bottom: 1.6mm; }
li::marker { color: #94a3b8; }

table { border-collapse: collapse; width: 100%; margin: 3mm 0 5mm; font-size: 9.1pt;
        page-break-inside: avoid; }
th { background: #f1f5f9; color: #0f172a; font-weight: 650; text-align: left;
     padding: 2.2mm 3mm; border-bottom: 1.6px solid #cbd5e1; font-size: 8.8pt;
     letter-spacing: .01em; }
td { padding: 2.2mm 3mm; border-bottom: 1px solid #e8edf3; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fbfcfe; }
td:first-child { color: #0f172a; font-weight: 550; }

code { font-family: 'JetBrains Mono','SF Mono',Consolas,monospace; font-size: .89em;
       background: #f1f5f9; padding: .4mm 1.2mm; border-radius: 3px; color: #4c1d95; }
pre { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #7c3aed;
      border-radius: 6px; padding: 3.4mm 4mm; overflow-x: auto; margin: 3mm 0 5mm;
      page-break-inside: avoid; }
pre code { background: none; padding: 0; color: #334155; font-size: 8.6pt; line-height: 1.5; }

figure { margin: 6mm 0 7mm; page-break-inside: avoid; page-break-before: auto; }
figure svg { display: block; margin: 0 auto;
             max-width: 100%; max-height: 160mm; width: auto; height: auto; }
figcaption { font-size: 8.6pt; color: #64748b; margin-top: 2.4mm; text-align: center;
             font-weight: 550; letter-spacing: .02em; }
blockquote { margin: 3mm 0; padding: 2mm 0 2mm 4mm; border-left: 3px solid #cbd5e1;
             color: #475569; }
"""


def build(md_name, out_name, cover):
    src = open(os.path.join(HERE, md_name), encoding="utf-8").read()

    # strip the leading H1 + metadata block; the cover replaces it
    src = re.sub(r"^#\s.*?\n(?:\n?\*\*.*\*\*\s*\n)*", "", src, count=1)
    src = src.lstrip("\n")
    if src.startswith("---\n"):
        src = src[4:].lstrip("\n")

    body = markdown.markdown(
        src, extensions=["tables", "fenced_code", "attr_list", "sane_lists"]
    )

    # inline every SVG figure
    def sub_img(m):
        alt, path = m.group(1), m.group(2)
        full = os.path.join(HERE, path)
        if not os.path.exists(full):
            return m.group(0)
        svg = open(full, encoding="utf-8").read()
        return f'<figure>{svg}<figcaption>{_html.escape(alt)}</figcaption></figure>'

    body = re.sub(r'<p><img alt="([^"]*)" src="([^"]+)"\s*/?></p>', sub_img, body)
    # figures escape the narrow text column
    body = body.replace("<figure>", '</div><div class="wrap full"><figure>')
    body = body.replace("</figure>", '</figure></div><div class="wrap">')

    rows = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in cover["meta"])
    doc = f"""<!doctype html><html><head><meta charset="utf-8">
<title>{_html.escape(cover['title'])}</title><style>{CSS}</style></head><body>
<div class="cover">
  <div class="eyebrow">{_html.escape(cover['eyebrow'])}</div>
  <h1>{_html.escape(cover['title'])}</h1>
  <div class="rule"></div>
  <div class="sub">{_html.escape(cover['sub'])}</div>
  <div style="height:12mm"></div>
  <dl>{rows}</dl>
</div>
<div class="wrap">
{body}
</div>
</body></html>"""

    html_path = os.path.join(HERE, out_name.replace(".pdf", ".html"))
    open(html_path, "w", encoding="utf-8").write(doc)
    pdf_path = os.path.join(HERE, out_name)
    subprocess.run([
        CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}", f"file://{html_path}",
    ], check=True, capture_output=True)
    print("wrote", pdf_path)
    return pdf_path


build("ARCHITECTURE.md", "enaible-Architecture.pdf", {
    "eyebrow": "Architecture Document · v1.0",
    "title": "enaible",
    "sub": "AI Enablement & Consulting Platform — system architecture, "
           "high-level and low-level design for the Phase 1 MVP.",
    "meta": [
        ("Product", "AI Enablement &amp; Consulting Platform"),
        ("Scope", "MVP (PRD Phase 1)"),
        ("Stack", "React Router v8 · TypeScript · Node · Cloud Run · Firestore · Gemini"),
        ("Contains", "HLA · LLA-1 modules · LLA-2 state machine · LLA-3 data · LLA-4 frontend &amp; deploy"),
        ("Status", "Proposed — for hackathon build"),
        ("Sources", "PRD v1.0 · FRD v1.0 · Firestore &amp; Vector Search spec · Agent System Prompts"),
    ],
})

build("IMPLEMENTATION_PLAN.md", "enaible-Implementation-Plan.pdf", {
    "eyebrow": "Implementation Plan · 48-hour sprint",
    "title": "enaible — Build Plan",
    "sub": "Hour-by-hour workstreams, milestones, cut list and risk responses "
           "for building the MVP in one hackathon sprint.",
    "meta": [
        ("Scope", "MVP (PRD Phase 1)"),
        ("Duration", "48 hours · freeze at T+44h"),
        ("Team", "3 builders (solo variant in §10)"),
        ("Starting point", "React Router v8 scaffold, one commit"),
        ("Milestones", "M1 T+12h · M2 T+24h · M3 T+36h"),
        ("Companion", "Architecture Document v1.0"),
    ],
})
