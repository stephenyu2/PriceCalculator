# Launch Valley Tutoring — Claude Code Briefing

## Project overview
Plain HTML5 / CSS3 / Vanilla JS. No framework, no build step, no package.json.
Deployed on Netlify (auto-deploy from `main` branch). Forms use Netlify Forms (`data-netlify="true"`).

## Running locally
```
python3 -m http.server 8080
```
Open http://localhost:8080.

## Site structure
```
/                          → index.html (landing page)
/pricing                   → pricing.html (pricing calculator)
/contact                   → contact.html
/about, /faq, /careers, /privacy, /terms
/get-started, /sign-up
/thank-you, /thank-you-diagnostic
/member-pricing            → member-pricing.html (hub)
/member-pricing-tutoring   → member-pricing-tutoring.html
/member-pricing-sat-act    → member-pricing-sat-act.html

/tutoring/                 → tutoring/index.html (hub with video panels)
/tutoring/<subject>/       → individual subject pages (14 total)

/math/<subject>/           → math subject pages (10 total)

/test-prep/                → test-prep/index.html (hub with video panels)
/test-prep/<service>/      → individual test prep pages (10 total)

/consulting/               → consulting/index.html (hub with video panels)
/consulting/<service>/     → individual consulting pages (3 total)

/curriculum/               → Academic Diagnostic tests (30 tests, email gate, timer, PDF)
/library/                  → library/index.html (tutor-only CCSS library hub)
/library/<subject>-<grade>/→ per-grade browsers (math-k..8/algebra1.., ela-k..12)
/library/material.html?id= → single lesson/worksheet/quiz viewer
```

## CSS architecture
- `styles.css` — global styles, CSS variables, nav, hero, buttons, dark mode
- `pricing.css` — pricing calculator section
- `member-pricing.css` — member pricing cards
- `contact.css` — contact form and cards
- `content-pages.css` — FAQ, About, Privacy, Terms, Careers
- `thank-you.css` — thank-you confirmation pages
- `tutoring/tutoring.css` — subject panel video sections (shared by tutoring, test-prep, and consulting hub pages)

**Important:** `styles.css` contains legacy subject panel rules from an old horizontal accordion layout (uses `grid-area`, `height: 48vh`, `flex-direction: row`). These are overridden by `tutoring/tutoring.css` which uses the current vertical layout. If you touch subject panel CSS, make changes in `tutoring/tutoring.css` — do not rely on the `styles.css` versions.

## Videos
All autoplay videos live in `/Videos/`. Always use the compressed versions:

| File | Size | Used by |
|---|---|---|
| LandingPageTiny.mp4 | 1.4 MB | index.html hero |
| MathTiny.mp4 | 13 MB | tutoring hub |
| ScienceTiny.mp4 | 17 MB | tutoring hub |
| Humanities.mp4 | 3 MB | tutoring hub |
| College.mp4 | 15 MB | consulting hub |
| Essay.mp4 | 3 MB | consulting hub |
| DiagnosticTest.mp4 | 7.2 MB | test-prep hub |
| TestPrep.mp4 | 1.2 MB | test-prep hub |

**Unused originals** (not referenced anywhere, should be deleted from repo):
- `Math.mp4` (53 MB)
- `Science.mp4` (92 MB)
- `LandingPage.mov` (11 MB)

Never add uncompressed source videos to the repo.

## Bandwidth targets
- Mobile: under 5 MB initial page load
- Desktop: under 15 MB initial page load

The tutoring hub currently loads ~33 MB (all three videos autoplay simultaneously). Lazy-loading the off-screen panels is a known pending improvement — load only the first panel's video on page load, defer the others until scroll or tap.

## JavaScript (script.js)
Single file, no dependencies. Handles: sticky nav, FAQ accordion, pricing calculator (grade selector → tier prices), mobile menu, scroll reveal (IntersectionObserver), testimonial card flip, dark/light mode (persisted to localStorage), Netlify form POST + redirect, Google Maps lazy-load facade.

## Design tokens
- Fonts: Playfair Display (headings), Inter (body) — loaded from Google Fonts
- Colors: navy (`#1a1a2e`), gold (`#8B6914`), off-white (`#f5f3ee`)
- Dark mode: toggled via `data-theme="dark"` on `<html>`, persisted to localStorage
- Fluid spacing: use `clamp()` — do not use fixed px for section padding

## Redirects
Old URL redirects are in `_redirects` (Netlify format). Check this before adding new routes.

## Curriculum library content pipeline (`library/pipeline/`)
Multi-agent pipeline that generates and verifies library material (lesson, worksheets Easy/Medium/Hard, quiz) per Common Core standard. See `library/pipeline/README.md` for full docs.

- **Agents:** Spec (standard → blueprint) → Generator (→ `staging/<id>.json`) → Verifier (re-solves every item independently + runs `check.mjs` via code execution, bounded retry ≤3, else flags). Orchestrated by `orchestrate.workflow.js` (run via the Workflow tool; note `args` arrives as a JSON string and is parsed in-script).
- **Deterministic helpers (run by hand, not agents):** `plan.mjs <grade> <subject>` computes the idempotent work list (re-running drops materials that now pass), `check.mjs` is the renderer-contract gate, `store.mjs` promotes ok-verdict staging files into `data/content/` and upserts `data/catalog.json`.
- **Renderer contract (critical):** `library/material.js` calls `render()` inside the fetch try/catch, so a malformed item shows "Material not found", not just a 404. Worksheet/lesson items need `solution.steps[]`; quiz items must be multiple choice (`A) ...` option lines + answer starting with the correct letter) with `solution.steps[]`. `check.mjs` enforces all of this.
- **Working dirs** (`staging/`, `verdicts/`, `feedback/`, `flagged/`, `reports/`) are gitignored run artifacts; `blueprints/` (spec outputs) are kept.
- Status: Grade 1, 2, 6 ELA fully generated. `6.RL.C.8` is intentionally unbuilt (RL.6.8 is "not applicable to literature").
