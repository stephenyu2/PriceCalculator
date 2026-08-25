# Launch Valley Tutoring — Claude Code Briefing

## Project overview
Plain HTML5 / CSS3 / Vanilla JS. No framework, no build step.
Deployed on Netlify. Forms use Netlify Forms (`data-netlify="true"`).
Four serverless functions in `netlify/functions/` (all dependency-free; the three checkout functions read `STRIPE_SECRET_KEY` from Netlify env vars — never put keys in front-end code):
- `create-intro-checkout.js` — Stripe checkout for the 5-hour intro package (/pricing); saves the card via `setup_future_usage`; prices hardcoded in cents, must match pricing.html. Prices are keyed by level, or `level-tier` for tiered levels (see tutor-tier note below); the server composes the key from validated inputs so a tampered price can't be charged.
- `create-setup-checkout.js` — card-on-file setup for migrating customers (/save-card), no charge
- `create-checkout.js` — legacy SAT planner checkout (the planner now routes purchases to /parent-portal instead)
- `submission-created.js` — Netlify TRIGGERED function (auto-runs after EVERY form submission site-wide); emails the submitter a confirmation via Resend. Verified sending domain is the SUBDOMAIN `contact.launchvalleytutoring.com`; reads `RESEND_API_KEY` + `FROM_EMAIL` + `REPLY_TO` from env vars. Per-form templates in `buildMessage()` (add a `case` for a new form); `SKIP_FORMS` excludes `diagnostic-email-gate`; forms without an email field self-skip; always returns 200 so a failed email never fails the submission. Business-side per-submission notifications are a SEPARATE no-code Netlify dashboard setting, not this function.

## Deploying (IMPORTANT — do not drag-and-drop)
The site is NOT auto-deployed from git. Deploy with the Netlify CLI from the project root:
```
netlify deploy --prod --dir .
```
The CLI is installed and already logged in / linked to the site (`glittering-smakager-f5fc2f` → launchvalleytutoring.com). This uploads only changed files AND packages the serverless function.
**Never deploy by dragging the folder into the Netlify UI** — drag-and-drop cannot package functions and would publish a site with a broken checkout. (Stephen's old workflow was drag-and-drop; it ended 2026-07-03.)

## Running locally
```
python3 -m http.server 8080
```
Open http://localhost:8080. Note: the Stripe checkout function does NOT run under this server (pages and calculator work; the pay buttons will error). To test checkout locally use `netlify dev` instead, or test on the live site.

## Site structure
```
/                          → index.html (landing page)
/contact                   → contact.html
/about, /faq, /careers, /privacy, /terms
/get-started
/thank-you, /thank-you-diagnostic
/member-pricing            → member-pricing.html (hub)
/member-pricing-tutoring   → member-pricing-tutoring.html
/member-pricing-sat-act    → member-pricing-sat-act.html
/sat-planner               → sat-planner.html (hidden SAT prep plan calculator: noindex/nofollow, unlinked, direct URL only). Shows the recommended plan and routes purchases to /parent-portal. ALL pricing math lives in sat-pricing.js (repo root) — never duplicate the formula; edit constants there only.

Billing / parent portal cluster (all noindex, prepaid-hours model, live since 2026-07-08):
/parent-portal             → parent-portal.html (hub: new families, migrating customers, plan management, six enrollment perks, resources). Also hosts the "Register for a Diagnostic Test" wizard: an in-page modal that branches Academic (subject → grade K-12/College) vs SAT/ACT (SAT-or-ACT → ScoreSmart/Bluebook), then proctored-this-Sunday-10AM (dynamic date) yes/no; No → pick day+time (this week only, 24h minimum, 6AM-8PM in 30-min slots) + location; ends collecting student name + email and POSTs the `diagnostic-registration` Netlify form (which sends a confirmation via the submission-created function).
/sign-up                   → sign-up.html (step 1: TutorBird enrollment widget)
/agreement                 → agreement.html (step 2: Tutoring Services Agreement, 14 sections; Netlify form is the consent record. Sections 3, 4, and 7 are cross-referenced from other pages — do not renumber them. §12 background-check notice, keep consistent with /safety/; §13 sessions/location + Zoom terms, keep consistent with tutor Module 1; §14 all payment through LVT)
/pricing                   → pricing.html (step 3: 5-hour intro package purchase, 20% off, via create-intro-checkout)
/save-card                 → save-card.html (migrating customers: card on file via create-setup-checkout) → /card-saved
/auto-refill               → auto-refill.html (Automatic Refill enrollment form + refill price table)
/manage-package            → manage-package.html (pause/change/cancel refills)
/payment-success           → payment-success.html (post-checkout landing page, noindex)

Tutor tiers (added 2026-08-07): Elementary, Middle, and High School are priced by tutor tier, Senior Tutor and Junior Tutor (Senior = more experienced, higher price). College and SAT/ACT are flat, no tier. On /pricing the intro flow shows a Senior/Junior sub-step for the three tiered levels; auto-refill.html does the same before the refill sizes; manage-package.html's Change Refill Size adds a Tutor Tier dropdown. Tier copy (the Senior/Junior descriptions) lives in the per-grade handout PDFs.

Prices live in these places that must move together: create-intro-checkout.js (hardcoded cents), pricing.html (intro), auto-refill.html and manage-package.html (refills), and the parent handout PDFs. The handouts are now THREE per-grade two-column (Senior/Junior) PDFs in iCloud at ~/Library/Mobile Documents/com~apple~CloudDocs/LaunchValleyTutoring/PaymentPackages/ (Elementary/Middle/High); the old single ~/Downloads/LVT-Packages-and-Payment.pdf is retired. See the packages-handout project memory for regen details. The six enrollment perks must also stay identical across the PDFs, parent-portal.html, and agreement.html Section 8.
Old-model pages (subscriptions, buy-hours, tutoring-packages) were deleted 2026-07-09; their URLs 301 to /parent-portal via _redirects.

Tutor portal cluster (all noindex, live since 2026-07-16; deliberately NO auth per Stephen, open like the parent portal, direct link only — do not add /tutors to robots.txt, that would advertise the path):
/tutors/                   → hub (mirrors parent-portal.html: site nav + hero + portal-card grid + footer)
/tutors/start, /tutors/agreement, /tutors/subjects, /tutors/background-check, /tutors/training (+ 7 module pages + /complete), /tutors/bank-and-w9, /tutors/emergency-contact, /tutors/resources, /tutors/incident-report, /tutors/headshot, /tutors/sat-practice, /tutors/meetings, /tutors/done
- /tutors/sat-practice/ and /tutors/meetings/ (added 2026-08-12) are unlinked-from-nowhere-else resource pages reached via hub "Software & Tools" cards: SAT Practice = College Board Question Bank + OnePrep (oneprep.com, the .com teacher product) + SAT Slayer (satslayer.org), with instructions; Online Meetings = the company Zoom room (no time limit, link+ID 948 487 1353+passcode 6dkqsK on the page) with Jitsi as backup.
- /tutors/rates/ still exists as the canonical rate schedule but was UNLINKED from the portal 2026-08-12 (junior tutors will be on different price tiers, so one schedule no longer fits). Reachable by direct URL only; re-add a hub card to restore it.
- Inner pages use the agreement.html-style pattern: floating back-pill + page hero, no nav. Shared assets: tutors/tutors.css, tutors/portal.js.
- /tutors/agreement/ is the CANONICAL Independent Contractor Agreement (currently ICA-2026-07-16-v4) and /tutors/rates/ the canonical rate schedule (RATES-2026-07-16-v3, training is unpaid — no stipend); the old PDFs are retired. RULE: any text change to a signable document bumps its version string in the same commit (page footer, hidden form field, and for modules also the kicker, quiz data-version, portal.js MODULES map, and the completion-form checkbox label). Module versions: 01=v4, 03=v3, others v2. Training copy tone: neutral, plain rules only — no persuasion, threats, or "here's why you should comply" rationale (Stephen's explicit preference, 2026-07-17).
- Three Netlify forms are the legal record: tutor-agreement, tutor-training-complete (one combined record for all seven modules), tutor-incident-report. portal.js submits them via AJAX POST to "/" then redirects. localStorage (lvt_module_01..07, lvt_bgcheck_ack) is cosmetic progress only.
- Background checks run through Checkr. /tutors/background-check/ has NO form by design (FCRA standalone-disclosure rule: never build a disclosure/authorization form or collect DOB/SSN); it only has an acknowledgment button.
- Tutor-facing primary contact is Derek (818) 441-2204; Stephen (818) 294-3292 stays on incident/emergency/harassment lines; Mark (818) 601-6889.

/safety/                   → PUBLIC, indexable (B&P § 18950 background-check notice; in sitemap; "Safety" footer link exists on every page — include it in the footer of any NEW page). Its claims (owners checked, annual re-runs) must stay true and consistent with agreement.html §12.

/tutoring/                 → tutoring/index.html (hub with video panels)
/tutoring/<subject>/       → individual subject pages (14 total)

/math/<subject>/           → math subject pages (10 total)

/test-prep/                → test-prep/index.html (hub with video panels)
/test-prep/<service>/      → individual test prep pages (10 total)

/consulting/               → consulting/index.html (hub with video panels)
/consulting/<service>/     → individual consulting pages (3 total)

/curriculum/               → Academic Diagnostic tests (math + ELA + Science, email gate, timer, PDF). Science (NGSS-coded) is now complete: elementary K-5, middle 6-8 (California integrated model, each grade mixes life/physical/earth science), and high school by COURSE not grade (biology/chemistry/physics as the grade slug, mirroring math's algebra1/geometry tokens). Data in curriculum/data/science-*.json; engine config (SCIENCE_PROGRESSION, GRADE_LABELS.science) in test-runner.js.
/library/                  → library/index.html (tutor-only CCSS library hub)
/library/<subject>-<grade>/→ per-grade browsers (math-k..8/algebra1.., ela-k..12, math-sat, ela-sat)
/library/material.html?id= → single lesson/worksheet/quiz viewer
/scholarship/              → closed program, noindex, kept for reference only (no footer links)
```

## CSS architecture
- `styles.css` — global styles, CSS variables, nav, hero, buttons
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
Single file, no dependencies. Handles: sticky nav, FAQ accordion, pricing calculator (grade selector → tier prices), mobile menu, scroll reveal (IntersectionObserver), testimonial card flip, Netlify form POST + redirect, Google Maps lazy-load facade.

## Design tokens
- Fonts: Playfair Display (headings), Inter (body) — loaded from Google Fonts
- Palette: black accent / cream / white, LIGHT MODE ONLY. The CSS variable names are legacy: `--navy` is now cream (`#f5f3ee`) and `--gold`/`--white` are now black (`#111111`). Read the values in `styles.css`, not the names. There is no dark mode — never add one, and remove dark-mode CSS if encountered.
- Copy style: never use em dashes; use a comma or period instead.
- Fluid spacing: use `clamp()` — do not use fixed px for section padding

## Redirects
Old URL redirects are in `_redirects` (Netlify format). Check this before adding new routes.

## Curriculum library content pipeline (`library/pipeline/`)
Multi-agent pipeline that generates and verifies library material per Common Core standard (and per cluster). See `library/pipeline/README.md` for full docs.

- **Material model:** The standard is the atomic unit. Per standard: `{std}--lesson` (~10 items), `{std}--quiz` (8, clickable MC), and worksheets in ONE of two shapes driven by `skeleton.*.standards[].worksheets`: simple standard (default `1`) → one ramped `{std}--worksheet` (15 items, Easy→Hard, `difficulty`/`tier` null); complex standard (`2` + `worksheetReason`) → `{std}--worksheet--tier1` + `{std}--worksheet--tier2` (15 each, no item overlap, tier1 Easy→Medium / tier2 Medium→Hard). Never three. Per cluster (standard `null`, `clusterId = {gradeCode}.{domainCode}.{clusterCode}` e.g. `7.RP.A`): `{clusterId}--cluster-worksheet` (15, worksheet contract) + `{clusterId}--cluster-test` (12, quiz contract) — items carry a per-item `standard` field so material.js renders per-standard section headers. Per-standard quizzes are kept (diagnostic join key); the cluster test is additional, not a replacement, and is NOT a `/curriculum/` diagnostic slice. Legacy `{std}--worksheet--easy|medium|hard` files still validate/render (cleaned up only when a grade is regenerated under the new model).
- **Agents:** Spec (standard → blueprint) → Generator (→ `staging/<id>.json`) → Verifier (re-solves every item independently + runs `check.mjs` via code execution, bounded retry ≤3, else flags). Orchestrated by `orchestrate.workflow.js` (run via the Workflow tool; note `args` arrives as a JSON string and is parsed in-script). NOTE: the agent prompts in `agents/` still describe the old Easy/Medium/Hard model and will be updated in a separate follow-up task (step two, generation).
- **Deterministic helpers (run by hand, not agents):** `plan.mjs <grade> <subject>` computes the idempotent work list (re-running drops materials that now pass), `check.mjs` is the renderer-contract gate, `store.mjs` promotes ok-verdict staging files into `data/content/` and upserts `data/catalog.json`.
- **Renderer contract (critical):** `library/material.js` calls `render()` inside the fetch try/catch, so a malformed item shows "Material not found", not just a 404. Worksheet/lesson (and cluster-worksheet) items need `solution.steps[]`; quiz (and cluster-test) items must be multiple choice (`A) ...` option lines + answer starting with the correct letter) with `solution.steps[]`; cluster materials additionally need a per-item `standard`. `check.mjs` enforces all of this (and is backward-compatible with the legacy easy/medium/hard worksheet ids).
- **Working dirs** (`staging/`, `verdicts/`, `feedback/`, `flagged/`, `reports/`) are gitignored run artifacts; `blueprints/` (spec outputs) are kept.
- Status: Grade 1, 2, 6 ELA and Precalculus math fully generated + verified. `6.RL.C.8` is intentionally unbuilt (RL.6.8 is "not applicable to literature").
- Math notation: write all math as LaTeX in `$...$` (KaTeX), never bare ASCII (`$\frac{7}{6}$` not `7/6`). Literal currency uses `\$` (material.js `safe()` converts it to a `$` span before KaTeX). `check.mjs` lints both. The Verifier computes every answer with `pipeline/.venv/bin/python3` (sympy + numpy).
