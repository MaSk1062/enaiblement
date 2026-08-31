#!/usr/bin/env python3
"""Generate HLA / LLA architecture diagrams for the enaible platform as clean SVG."""
import os, html

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diagrams")
os.makedirs(OUT, exist_ok=True)

FONT = "'Inter','Segoe UI',-apple-system,Helvetica,Arial,sans-serif"
MONO = "'JetBrains Mono','SF Mono',Consolas,monospace"

# palette: (stroke, fill, text)
P = {
    "client":   ("#2563eb", "#eff6ff", "#1e3a8a"),
    "service":  ("#7c3aed", "#f5f3ff", "#4c1d95"),
    "agent":    ("#0d9488", "#f0fdfa", "#134e4a"),
    "data":     ("#ea580c", "#fff7ed", "#7c2d12"),
    "platform": ("#64748b", "#f8fafc", "#334155"),
    "external": ("#be185d", "#fdf2f8", "#831843"),
    "neutral":  ("#94a3b8", "#ffffff", "#0f172a"),
}

class Svg:
    def __init__(self, w, h, title=""):
        self.w, self.h, self.title = w, h, title
        self.body = []

    def add(self, s):
        self.body.append(s)

    # ---------- primitives ----------
    def rect(self, x, y, w, h, kind="neutral", r=10, dash=None, sw=1.6, fill=None):
        st, fl, _ = P[kind]
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
                 f'fill="{fill or fl}" stroke="{st}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=13, kind="neutral", weight=500, anchor="middle",
             font=None, fill=None, opacity=1.0):
        col = fill or P[kind][2]
        self.add(f'<text x="{x}" y="{y}" font-family="{font or FONT}" font-size="{size}" '
                 f'font-weight="{weight}" fill="{col}" text-anchor="{anchor}" '
                 f'opacity="{opacity}">{html.escape(s)}</text>')

    def group(self, x, y, w, h, label, kind="platform", dash="6 5", chip="left"):
        """Dashed grouping container with a label chip."""
        st = P[kind][0]
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="none" '
                 f'stroke="{st}" stroke-width="1.4" stroke-dasharray="{dash}" opacity="0.75"/>')
        tw = len(label) * 6.6 + 18
        cx = x + 16 if chip == "left" else x + w - 16 - tw
        self.add(f'<rect x="{cx}" y="{y-11}" width="{tw}" height="22" rx="11" '
                 f'fill="#ffffff" stroke="{st}" stroke-width="1.2"/>')
        self.text(cx + tw / 2, y + 4, label, size=11.5, weight=700, fill=st)

    def node(self, x, y, w, h, lines, kind="neutral", r=10, dash=None, badge=None,
             size=13.5, sub_size=11, gap=15):
        """Box with a bold first line and lighter subsequent lines."""
        self.rect(x, y, w, h, kind, r=r, dash=dash)
        st, _, tc = P[kind]
        n = len(lines)
        total = size + (n - 1) * gap
        cy = y + h / 2 - total / 2 + size * 0.78
        for i, ln in enumerate(lines):
            if i == 0:
                self.text(x + w / 2, cy, ln, size=size, weight=650, fill=tc)
            else:
                self.text(x + w / 2, cy, ln, size=sub_size, weight=450, fill=tc, opacity=0.82)
            cy += gap if i else size * 0.55 + gap * 0.72
        if badge:
            self.add(f'<circle cx="{x+w-14}" cy="{y+14}" r="10" fill="{st}"/>')
            self.text(x + w - 14, y + 18, badge, size=10.5, weight=700, fill="#ffffff")

    def arrow(self, x1, y1, x2, y2, label=None, color="#475569", dash=None,
              lx=None, ly=None, bend=None, both=False, lsize=10.5, lbg=True):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        if bend == "h":   # horizontal-then-vertical elbow
            path = f"M {x1} {y1} L {x2} {y1} L {x2} {y2}"
        elif bend == "v":
            path = f"M {x1} {y1} L {x1} {y2} L {x2} {y2}"
        elif bend == "s":  # smooth curve
            mx = (x1 + x2) / 2
            path = f"M {x1} {y1} C {mx} {y1}, {mx} {y2}, {x2} {y2}"
        else:
            path = f"M {x1} {y1} L {x2} {y2}"
        start = ' marker-start="url(#dotmark)"' if both else ""
        self.add(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.7" '
                 f'marker-end="url(#arrow)"{start}{d}/>')
        if label:
            tx = lx if lx is not None else (x1 + x2) / 2
            ty = ly if ly is not None else (y1 + y2) / 2 - 6
            if lbg:
                w = len(label) * (lsize * 0.55) + 12
                self.add(f'<rect x="{tx-w/2}" y="{ty-lsize+1}" width="{w}" height="{lsize+7}" '
                         f'rx="6" fill="#ffffff" opacity="0.94"/>')
            self.text(tx, ty, label, size=lsize, weight=550, fill=color)

    def render(self):
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" font-family="{FONT}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569"/>
  </marker>
  <marker id="dotmark" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
    <circle cx="5" cy="5" r="3.5" fill="#475569"/>
  </marker>
</defs>
<rect width="{self.w}" height="{self.h}" fill="#ffffff"/>
{chr(10).join(self.body)}
</svg>'''

    def save(self, name):
        p = os.path.join(OUT, name)
        with open(p, "w", encoding="utf-8") as f:
            f.write(self.render())
        print("wrote", p)


# =====================================================================
# HLA - High-Level Architecture
# =====================================================================
def hla():
    s = Svg(1460, 1010)
    s.text(48, 46, "enaible - High-Level Architecture (HLA)", size=23, weight=750, anchor="start")
    s.text(48, 70, "AI Enablement & Consulting Platform · MVP · Google Cloud",
           size=12.5, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="86" x2="1412" y2="86" stroke="#e2e8f0" stroke-width="1.5"/>')

    # ---- Tier 1: Users
    s.group(48, 118, 1364, 96, "1 · Actors")
    for i, (nm, sub) in enumerate([
        ("The Visionary", "CEO / Founder"),
        ("The Implementer", "CTO / CIO"),
        ("The Operator", "Dept. head / AI champion"),
        ("Knowledge Curator", "internal · KB ingestion"),
    ]):
        x = 78 + i * 340
        s.node(x, 138, 300, 58, [nm, sub], "external", r=29)

    # ---- Tier 2: Client
    s.group(48, 254, 1364, 118, "2 · Client (browser)")
    s.node(78, 276, 640, 78,
           ["React Router v8 SPA + SSR  ·  TypeScript + Tailwind",
            "/login  /onboarding  /dashboard/{chat, canvas, roadmap}"], "client")
    s.node(742, 276, 316, 78,
           ["Strategy Canvas store", "optimistic state · live agent patches"], "client")
    s.node(1082, 276, 300, 78,
           ["Export module", "strategy → PDF / slide deck"], "client")

    # ---- Tier 3: Cloud Run
    s.group(48, 412, 1364, 258, "3 · Application tier - Google Cloud Run (container, scale 0→N)", chip="right")
    s.node(78, 440, 300, 74, ["Edge / SSR server", "React Router request handler"], "service")
    s.node(408, 440, 320, 74, ["Auth middleware", "Firebase JWT verify · session guard"], "service")
    s.node(758, 440, 300, 74, ["REST API layer", "/api/session · /api/chat · /api/export"], "service")
    s.node(1088, 440, 294, 74, ["Knowledge admin API", "/api/knowledge/ingest"], "service")

    s.node(78, 552, 650, 92,
           ["Agent Orchestrator  ·  deterministic stage machine",
            "routes each turn to one specialist agent, persists state transition"], "agent")
    s.node(758, 552, 300, 92, ["RAG service", "embed → filter → findNearest", "graceful empty-context fallback"], "agent", gap=14)
    s.node(1088, 552, 294, 92, ["Prompt + JSON contract layer", "schema repair · exponential backoff"], "agent")

    # ---- Tier 4: agents row
    s.group(48, 706, 700, 118, "4 · Specialist agents (prompt-scoped)")
    ag = [("Discovery", "A1"), ("Analyst", "A2"), ("Architect", "A3"), ("PM", "A4"), ("Coach", "A5")]
    for i, (nm, code) in enumerate(ag):
        x = 68 + i * 134
        s.node(x, 730, 122, 72, [nm, code], "agent", r=9, size=12.5, sub_size=10)

    # ---- Tier 5: data + platform
    s.group(772, 706, 640, 118, "5 · Data tier - Firestore (native mode)")
    s.node(796, 730, 190, 72, ["users", "profile · role · industry"], "data", size=12.5, sub_size=10)
    s.node(1002, 730, 190, 72, ["sessions", "messages · AgentState"], "data", size=12.5, sub_size=10)
    s.node(1208, 730, 188, 72, ["knowledge_base", "768-d vector index"], "data", size=12.5, sub_size=10)

    s.group(48, 866, 1364, 106, "6 · Google Cloud platform services  (consumed by tiers 3–5, no direct client access)")
    for i, (nm, sub, k) in enumerate([
        ("Firebase Auth", "SSO → JWT · used by ②", "platform"),
        ("Gemini API", "2.5-flash + embedding-004 · ⑤", "platform"),
        ("Secret Manager", "keys injected at boot · ④", "platform"),
        ("Artifact Registry", "container images", "platform"),
        ("Cloud Logging", "traces · agent telemetry", "platform"),
    ]):
        x = 74 + i * 268
        s.node(x, 890, 246, 62, [nm, sub], "platform", r=9, size=12.5, sub_size=10)

    # ---- flows
    A = s.arrow
    A(730, 196, 730, 274, "HTTPS · SSO", ly=238)
    A(398, 354, 398, 438, "SSR + fetch", ly=402)
    A(898, 354, 898, 438, "JSON over HTTPS", ly=402)
    A(378, 477, 406, 477)
    A(728, 477, 756, 477)
    A(898, 514, 732, 578, "dispatch turn", lx=830, ly=536, bend="s")
    A(728, 598, 756, 598, "retrieve", ly=590, lsize=9.5)
    A(1058, 598, 1086, 598)
    A(400, 644, 400, 702, "invoke 1 of 5", ly=680)

    # orchestrator -> firestore
    A(690, 620, 800, 748, "read / write state", lx=770, ly=690, bend="s", lsize=10)
    # rag -> knowledge base
    A(1000, 644, 1290, 726, "kNN COSINE", lx=1170, ly=690, bend="s", lsize=10)

    s.text(48, 998, "Single deployable container: the React Router server hosts both SSR and the /api surface. "
                    "Orchestrator and agents are server-side modules, extractable to a dedicated Cloud Run service without any client change.",
           size=11, weight=450, anchor="start", fill="#64748b")
    s.save("hla.svg")


# =====================================================================
# LLA-1 - Backend module decomposition + /api/chat request path
# =====================================================================
def lla_modules():
    s = Svg(1460, 1000)
    s.text(48, 46, "LLA-1 - Backend module decomposition & the /api/chat request path",
           size=21, weight=750, anchor="start")
    s.text(48, 69, "Every numbered hop is one function call inside the Cloud Run container unless marked as a network call.",
           size=12, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="84" x2="1412" y2="84" stroke="#e2e8f0" stroke-width="1.5"/>')

    cols = [
        ("routes/", "client"), ("middleware/", "service"), ("orchestrator/", "agent"),
        ("agents/", "agent"), ("services/", "data"),
    ]
    files = [
        ["app/routes/api.chat.ts", "app/routes/api.session.ts", "app/routes/api.knowledge.ts",
         "app/routes/api.export.ts"],
        ["requireUser.ts", "rateLimit.ts", "errorEnvelope.ts", "requestLogger.ts"],
        ["stageMachine.ts", "runTurn.ts", "stateReducer.ts", "transitions.ts"],
        ["discovery.ts", "analyst.ts", "architect.ts", "projectManager.ts", "changeCoach.ts"],
        ["firestore.ts", "gemini.ts", "rag.ts", "embeddings.ts", "schemas.ts (zod)"],
    ]
    x0, cw, gap = 56, 262, 20
    for i, ((nm, kind), fl) in enumerate(zip(cols, files)):
        x = x0 + i * (cw + gap)
        s.group(x, 122, cw, 46 + len(fl) * 34, nm, kind)
        for j, f in enumerate(fl):
            y = 144 + j * 34
            s.rect(x + 14, y, cw - 28, 26, kind, r=6, sw=1.2)
            s.text(x + cw / 2, y + 17.5, f, size=11, weight=500, font=MONO, kind=kind)

    # sequence lane
    s.group(56, 396, 1356, 512, "Sequence · POST /api/chat")
    lanes = [("Client", 150), ("api.chat.ts", 372), ("requireUser", 578),
             ("stageMachine", 800), ("agent module", 1030), ("Firestore / Gemini", 1270)]
    for nm, x in lanes:
        s.rect(x - 92, 418, 184, 34, "neutral", r=8, sw=1.4, fill="#f1f5f9")
        s.text(x, 440, nm, size=11.5, weight=650)
        s.add(f'<line x1="{x}" y1="452" x2="{x}" y2="888" stroke="#cbd5e1" '
              f'stroke-width="1.4" stroke-dasharray="4 4"/>')

    steps = [
        (150, 372, 482, "1 · POST {sessionId, userMessage} + Bearer JWT"),
        (372, 578, 518, "2 · verify Firebase ID token"),
        (578, 372, 554, "3 · uid"),
        (372, 1270, 590, "4 · sessions/{id}.get()   [network]"),
        (1270, 372, 626, "5 · SessionDocument"),
        (372, 800, 662, "6 · runTurn(state, message)"),
        (800, 1030, 698, "7 · dispatch on state.currentStage"),
        (1030, 1270, 734, "8 · RAG kNN + generateContent   [network]"),
        (1270, 1030, 770, "9 · raw JSON → zod parse / repair"),
        (1030, 800, 806, "10 · patch + next stage"),
        (800, 372, 838, "11 · {reply, state}"),
        (372, 1270, 866, "12 · sessions/{id}.update()   [network]"),
        (372, 150, 892, "13 · 200 {reply, state}  → canvas re-renders"),
    ]
    for a, b, y, lab in steps:
        col = "#0d9488" if "network" in lab else "#475569"
        s.arrow(a, y, b, y, lab, color=col, lx=(a + b) / 2, ly=y - 7, lsize=10.2)

    s.text(56, 946, "Failure policy - 4/12 Firestore: 5xx returns an error envelope, no state mutation.  "
                    "8: Gemini retried 5× with exponential backoff (1s→16s).  "
                    "9: one schema-repair re-prompt, then the turn is returned as plain prose and the stage is NOT advanced.",
           size=11, weight=450, anchor="start", fill="#64748b")
    s.text(56, 968, "Invariant - the stage only advances after the parsed payload has been persisted, so a crashed turn is always replayable.",
           size=11, weight=550, anchor="start", fill="#334155")
    s.save("lla-1-modules.svg")


# =====================================================================
# LLA-2 - Agent state machine
# =====================================================================
def lla_state():
    s = Svg(1460, 780)
    s.text(48, 46, "LLA-2 - Orchestrator stage machine & AgentState mutations",
           size=21, weight=750, anchor="start")
    s.text(48, 69, "state.currentStage is the single source of truth. One agent owns each stage and writes exactly one field.",
           size=12, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="84" x2="1412" y2="84" stroke="#e2e8f0" stroke-width="1.5"/>')

    stages = [
        ("discovery", "Discovery Consultant", "needsAssessment", "loops until status:complete"),
        ("research", "Industry Analyst", "useCases[]", "RAG-grounded · 3 use cases"),
        ("architecture", "Technical Architect", "architectureStack", "gated on ≥1 approved use case"),
        ("roadmap", "Project Manager", "roadmapPhases[]", "3 phases · pilot→integrate→scale"),
        ("training", "Change Coach", "changeManagementPlan", "upskilling · comms · KPIs"),
        ("complete", "AI Enabler (Q&A)", "- read only -", "export unlocked"),
    ]
    y = 150
    bw, bh = 206, 96
    xs = []
    for i, (st, agent, field, note) in enumerate(stages):
        x = 60 + i * 228
        xs.append(x)
        kind = "data" if st == "complete" else "agent"
        s.rect(x, y, bw, bh, kind, r=12)
        s.text(x + bw / 2, y + 26, st, size=14.5, weight=700, font=MONO, kind=kind)
        s.text(x + bw / 2, y + 47, agent, size=11.5, weight=550, kind=kind, opacity=0.9)
        s.rect(x + 16, y + 58, bw - 32, 24, kind, r=6, sw=1.1, fill="#ffffff")
        s.text(x + bw / 2, y + 74.5, field, size=10.5, weight=600, font=MONO, kind=kind)
        s.text(x + bw / 2, y + 114, note, size=10, weight=450, fill="#64748b")
        if i:
            s.arrow(x - 22, y + bh / 2, x, y + bh / 2, lbg=False)

    # self loop on discovery
    s.add(f'<path d="M {60+bw*0.3} {y} C {60+bw*0.3} {y-52}, {60+bw*0.7} {y-52}, {60+bw*0.7} {y}" '
          f'fill="none" stroke="#475569" stroke-width="1.7" marker-end="url(#arrow)"/>')
    s.text(60 + bw / 2, y - 40, "probing question loop", size=10.5, weight=550, fill="#475569")

    # user-gate between research and architecture
    s.node(xs[1] + 40, y + 176, 300, 62,
           ["User approval gate", "approve / reject use cases on the Canvas"], "client", r=10)
    s.arrow(xs[1] + 190, y + 176, xs[1] + 190, y + bh + 4, "", lbg=False)
    s.arrow(xs[1] + 250, y + bh + 4, xs[1] + 250, y + 176, "", lbg=False)
    s.text(xs[1] + 190, y + 256, "PATCH /api/session/:id/use-cases", size=10.5, weight=550,
           font=MONO, fill="#1e3a8a")

    # backward edge: complete -> discovery (revision), routed around the outside
    s.add(f'<path d="M {xs[5]+bw} {y+bh/2} H 1436 V {y+322} H 30 V {y+bh/2} H {xs[0]-4}" '
          f'fill="none" stroke="#be185d" stroke-width="1.7" stroke-dasharray="6 5" '
          f'marker-end="url(#arrow)"/>')
    s.add(f'<rect x="380" y="{y+310}" width="700" height="24" rx="6" fill="#ffffff"/>')
    s.text(730, y + 326, "\"revise\" intent → orchestrator rewinds currentStage and preserves prior artefacts (post-MVP)",
           size=11, weight=600, fill="#be185d")

    # persistence band
    s.group(60, 528, 1352, 116, "Persistence · sessions/{sessionId}")
    s.node(84, 554, 300, 74, ["messages[]", "append-only ChatMessage log"], "data")
    s.node(408, 554, 300, 74, ["state.currentStage", "advanced only on valid payload"], "data")
    s.node(732, 554, 340, 74, ["state.<field>", "needsAssessment · useCases · stack · phases · plan"], "data", sub_size=10)
    s.node(1096, 554, 292, 74, ["updatedAt", "optimistic-concurrency check"], "data")

    s.text(60, 686, "Recovery - because the whole AgentState is one document written in a single update(), a failed turn leaves the session on its previous stage.",
           size=11, weight=450, anchor="start", fill="#64748b")
    s.text(60, 706, "The client reconciles by re-reading the session on reconnect; no server-side in-memory agent state exists, so any Cloud Run instance can serve any turn.",
           size=11, weight=450, anchor="start", fill="#64748b")
    s.text(60, 734, "Cold-start note - stateless instances mean scale-to-zero is safe; the trade-off is a ~1–2s cold start on the first turn after idle.",
           size=11, weight=550, anchor="start", fill="#334155")
    s.save("lla-2-state-machine.svg")


# =====================================================================
# LLA-3 - Data model & vector search
# =====================================================================
def lla_data():
    s = Svg(1460, 900)
    s.text(48, 46, "LLA-3 - Firestore data model & RAG vector-search path",
           size=21, weight=750, anchor="start")
    s.text(48, 69, "Three collections. Sessions denormalise the whole workspace into one document so a turn is one read and one write.",
           size=12, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="84" x2="1412" y2="84" stroke="#e2e8f0" stroke-width="1.5"/>')

    def entity(x, y, w, title, path, fields, kind="data"):
        h = 62 + len(fields) * 23
        s.rect(x, y, w, h, kind, r=12)
        st = P[kind][0]
        s.add(f'<path d="M {x} {y+42} h {w}" stroke="{st}" stroke-width="1.4" opacity="0.5"/>')
        s.text(x + w / 2, y + 22, title, size=14, weight=700, kind=kind)
        s.text(x + w / 2, y + 36, path, size=10, weight=500, font=MONO, kind=kind, opacity=0.75)
        for i, (f, t) in enumerate(fields):
            yy = y + 60 + i * 23
            s.text(x + 16, yy, f, size=11, weight=550, font=MONO, anchor="start", kind=kind)
            s.text(x + w - 16, yy, t, size=10.5, weight=450, font=MONO, anchor="end",
                   fill="#64748b")
        return h

    entity(60, 130, 380, "users", "users/{uid}", [
        ("uid", "string"), ("email", "string"), ("displayName", "string"),
        ("role", "enum · 4"), ("industry", "enum · 5"), ("companySize", "enum · 4"),
        ("createdAt / lastLoginAt", "Timestamp"),
    ])

    entity(520, 130, 420, "sessions", "sessions/{sessionId}", [
        ("sessionId · userId", "string"), ("userProfile", "map"),
        ("messages[]", "ChatMessage"), ("state.currentStage", "enum · 6"),
        ("state.needsAssessment", "map"), ("state.useCases[]", "UseCase"),
        ("state.architectureStack", "map"), ("state.roadmapPhases[]", "RoadmapPhase"),
        ("state.changeManagementPlan", "map"), ("createdAt / updatedAt", "Timestamp"),
    ])

    entity(1020, 130, 392, "knowledge_base", "knowledge_base/{docId}", [
        ("industry", "enum · filter"), ("category", "case_study | tool_spec | …"),
        ("title · content", "string"), ("sourceUrl", "string?"),
        ("embedding", "Vector(768)"), ("metadata.targetRoles[]", "string[]"),
        ("metadata.impactScore", "number"), ("metadata.tags[]", "string[]"),
    ])

    s.arrow(440, 200, 518, 200, "1 : N", ly=192)
    s.text(1216, 404, "No join to sessions - read by the RAG service only, at query time.",
           size=11, weight=550, fill="#0d9488")
    s.text(730, 452, "One document per consultation: a turn is exactly one get() + one update().",
           size=11, weight=550, fill="#7c2d12")
    s.text(250, 380, "Written once at onboarding; read on every session start.",
           size=11, weight=450, fill="#64748b")

    # vector pipeline
    s.group(60, 490, 1352, 224, "RAG retrieval pipeline · findRelevantCaseStudies()")
    steps = [
        ("bottleneck text", "from state.needsAssessment", "agent"),
        ("text-embedding-004", "→ number[768]", "platform"),
        ("where(industry ==)", "pre-filter, cuts scan set", "data"),
        ("findNearest()", "COSINE · limit 3", "data"),
        ("context block", "title + content, ~2k tokens", "agent"),
        ("Analyst prompt", "grounded generation", "agent"),
    ]
    bw = 200
    for i, (t, sub, k) in enumerate(steps):
        x = 84 + i * 222
        s.node(x, 528, bw, 78, [t, sub], k, size=12.5, sub_size=10.5)
        if i:
            s.arrow(x - 22, 567, x, 567, lbg=False)

    s.rect(84, 620, 1304, 72, "platform", r=8, sw=1.2)
    s.text(100, 640, "Index - must exist before the first query, and takes minutes to build. Create it on day one:",
           size=11, weight=650, anchor="start", kind="platform")
    for i, ln in enumerate([
        "gcloud alpha firestore indexes composite create --collection-group=knowledge_base --query-scope=COLLECTION \\",
        "  --field-config field-path=industry,order=ASCENDING \\",
        "  --field-config field-path=embedding,vector-config='{\"dimension\":\"768\",\"flat\":{}}'",
    ]):
        s.text(100, 657 + i * 14, ln, size=9.8, weight=450, anchor="start", font=MONO, fill="#334155")

    # security rules
    s.group(60, 754, 1352, 120, "Access control")
    rules = [
        ("users/{uid}", "read/write if request.auth.uid == uid"),
        ("sessions/{id}", "read/write if resource.data.userId == request.auth.uid"),
        ("knowledge_base/*", "client access denied - server (Admin SDK) only"),
        ("Admin ingest", "/api/knowledge/ingest behind an admin custom claim"),
    ]
    for i, (a, b) in enumerate(rules):
        x = 84 + i * 334
        s.node(x, 780, 312, 72, [a, b], "external", size=12, sub_size=10)

    s.save("lla-3-data-model.svg")


# =====================================================================
# LLA-4 - Frontend & deployment
# =====================================================================
def lla_frontend():
    s = Svg(1460, 830)
    s.text(48, 46, "LLA-4 - Frontend route/component tree & deployment topology",
           size=21, weight=750, anchor="start")
    s.text(48, 69, "React Router v8 framework mode: loaders/actions run on the same server that hosts the API, so the client never holds a service credential.",
           size=12, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="84" x2="1412" y2="84" stroke="#e2e8f0" stroke-width="1.5"/>')

    s.group(60, 120, 700, 400, "app/routes.ts")
    tree = [
        (0, "root.tsx", "shell · theme · auth context", True),
        (1, "login.tsx", "Firebase SSO popup → ID token cookie", False),
        (1, "onboarding.tsx", "3-step profile form → users/{uid}", False),
        (1, "dashboard.tsx", "layout · session loader · nav", True),
        (2, "dashboard.chat.tsx", "message list + composer + agent badge", False),
        (2, "dashboard.canvas.tsx", "use-case kanban + stack visualiser", False),
        (2, "dashboard.roadmap.tsx", "3-phase gantt + change plan", False),
        (1, "api.*.ts", "resource routes · no UI export", False),
    ]
    for i, (d, nm, sub, layout) in enumerate(tree):
        y = 150 + i * 46
        x = 84 + d * 34
        w = 640 - d * 34
        k = "service" if layout else "client"
        s.rect(x, y, w, 36, k, r=8, sw=1.3)
        s.text(x + 14, y + 22, nm, size=11.5, weight=650, font=MONO, anchor="start", kind=k)
        s.text(x + w - 14, y + 22, sub, size=10.5, weight=450, anchor="end", fill="#64748b")
        if d:
            s.add(f'<path d="M {x-16} {y-10} v {26} h 14" fill="none" stroke="#cbd5e1" stroke-width="1.4"/>')

    s.group(792, 120, 620, 400, "Shared client state")
    s.node(816, 150, 572, 66, ["SessionProvider  (React context)",
                               "holds AgentState; every API response replaces it wholesale"], "client")
    s.node(816, 232, 274, 90, ["useChat()", "optimistic user bubble", "typing indicator per agent"], "client", gap=14)
    s.node(1114, 232, 274, 90, ["useStrategy()", "derives canvas + gantt", "from the same AgentState"], "client", gap=14)
    s.node(816, 338, 572, 66, ["Why one state object", "canvas and roadmap update the instant a turn lands - no second fetch, no drift"], "client")
    s.node(816, 420, 572, 76, ["Export", "client-side html → /api/export → server renders PDF & PPTX from AgentState"], "client")

    # deployment
    s.group(60, 560, 1352, 210, "Deployment topology")
    d = [
        ("GitHub", "push to main", "external"),
        ("Cloud Build", "docker build · npm ci", "platform"),
        ("Artifact Registry", "enaible:sha", "platform"),
        ("Cloud Run", "min 0 · max 10 · 1 vCPU / 1GiB\nconcurrency 80 · 60s timeout", "service"),
        ("Firestore + Auth", "same project · IAM SA binding", "data"),
    ]
    for i, (nm, sub, k) in enumerate(d):
        x = 84 + i * 268
        lines = [nm] + sub.split("\n")
        s.node(x, 596, 244, 92, lines, k, size=12.5, sub_size=10, gap=14)
        if i:
            s.arrow(x - 24, 642, x, 642, lbg=False)
    s.rect(84, 704, 1304, 46, "platform", r=8, sw=1.2)
    s.text(100, 732, "Runtime secrets: GEMINI_API_KEY + FIREBASE_ADMIN_SA mounted from Secret Manager as env vars; "
                     "the runtime service account holds only datastore.user + secretmanager.secretAccessor.",
           size=10.6, weight=500, anchor="start", fill="#334155")
    s.save("lla-4-frontend-deploy.svg")


# =====================================================================
# Sprint plan Gantt
# =====================================================================
def sprint():
    s = Svg(1460, 760)
    s.text(48, 46, "48-hour sprint plan - workstream timeline", size=21, weight=750, anchor="start")
    s.text(48, 69, "T0 = kickoff. Hard freeze at T+44h; the last 4 hours are demo rehearsal only.",
           size=12, weight=450, anchor="start", fill="#64748b")
    s.add('<line x1="48" y1="84" x2="1412" y2="84" stroke="#e2e8f0" stroke-width="1.5"/>')

    x0, x1 = 300, 1400
    hours = 48
    def hx(h): return x0 + (x1 - x0) * h / hours

    # axis
    for h in range(0, hours + 1, 4):
        s.add(f'<line x1="{hx(h)}" y1="118" x2="{hx(h)}" y2="600" stroke="#e2e8f0" stroke-width="1"/>')
        s.text(hx(h), 110, f"T+{h}h", size=10.5, weight=550, fill="#94a3b8")
    for h, lab, col in [(12, "M1 chat loop", "#0d9488"), (24, "M2 full pipeline", "#7c3aed"),
                        (36, "M3 export + polish", "#2563eb"), (44, "FREEZE", "#be185d")]:
        s.add(f'<line x1="{hx(h)}" y1="118" x2="{hx(h)}" y2="616" stroke="{col}" stroke-width="1.6" stroke-dasharray="5 4"/>')
        s.text(hx(h), 634, lab, size=10.5, weight=700, fill=col)

    rows = [
        ("Infra & auth", [(0, 3, "GCP + Firestore + Auth", "platform"),
                          (3, 6, "Dockerfile fix + deploy", "platform"),
                          (30, 33, "Secret Manager + CI", "platform")]),
        ("Knowledge base", [(2, 5, "author 25 seed docs", "data"),
                            (5, 8, "ingest + vector index", "data"),
                            (20, 23, "tune retrieval", "data")]),
        ("Backend / agents", [(3, 9, "session + chat endpoints", "agent"),
                              (9, 14, "discovery + analyst", "agent"),
                              (14, 22, "architect + PM + coach", "agent"),
                              (22, 27, "zod schemas + retry", "agent")]),
        ("Frontend", [(2, 8, "shell, login, onboarding", "client"),
                      (8, 15, "chat room", "client"),
                      (15, 24, "strategy canvas", "client"),
                      (24, 30, "roadmap gantt", "client")]),
        ("Export", [(28, 34, "PDF + deck from AgentState", "service")]),
        ("Hardening", [(33, 40, "error states, empty states, mobile", "service"),
                       (40, 44, "seeded demo session + fallbacks", "service")]),
        ("Demo", [(36, 44, "script + slides", "external"),
                  (44, 48, "rehearse ×3", "external")]),
    ]
    y = 140
    for name, bars in rows:
        s.add(f'<rect x="48" y="{y-4}" width="{x1-48}" height="56" rx="8" fill="#f8fafc"/>')
        s.text(56, y + 30, name, size=13, weight=650, anchor="start")
        for a, b, lab, k in bars:
            st, fl, tc = P[k]
            bx, bw = hx(a), hx(b) - hx(a)
            s.add(f'<rect x="{bx}" y="{y+8}" width="{bw}" height="34" rx="8" fill="{fl}" stroke="{st}" stroke-width="1.5"/>')
            avail = bw - 12
            size = 10.2
            fits = len(lab) * size * 0.505 <= avail
            if fits:
                s.text(bx + bw / 2, y + 30, lab, size=size, weight=560, fill=tc)
            else:
                # split into two balanced lines on a word boundary
                words, best, bd = lab.split(), None, 1e9
                for i in range(1, len(words)):
                    l1, l2 = " ".join(words[:i]), " ".join(words[i:])
                    d = abs(len(l1) - len(l2))
                    if d < bd:
                        bd, best = d, (l1, l2)
                l1, l2 = best or (lab, "")
                size = min(9.4, avail / (max(len(l1), len(l2)) * 0.505))
                size = max(size, 6.6)
                s.text(bx + bw / 2, y + 24, l1, size=size, weight=560, fill=tc)
                s.text(bx + bw / 2, y + 24 + size + 2, l2, size=size, weight=560, fill=tc)
        y += 66

    s.group(48, 664, 1352, 60, "Parallelism assumption")
    s.text(72, 700, "3 builders: one full-stack on backend/agents, one on frontend, one floating across infra + knowledge base + demo.",
           size=11.5, weight=500, anchor="start", fill="#334155")
    s.text(72, 718, "A solo builder should cut the Canvas kanban to a static list, drop the export deck, and stop at M2.",
           size=11.5, weight=500, anchor="start", fill="#334155")
    s.save("sprint-plan.svg")


hla(); lla_modules(); lla_state(); lla_data(); lla_frontend(); sprint()
print("done")
