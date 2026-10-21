# Cloud Save Phases

Branch: `feature/cloud-save` (from local `main` at 8e43baf), worktree `.claude/worktrees/cloud-save`. Spec: [CLOUD_SPEC.md](CLOUD_SPEC.md).

Rules
- One phase at a time; commit at the end of each phase. Do not push or merge to `main` without the user's approval.
- At the start of a phase: re-read the spec sections listed.
- Local save/load must keep working after every phase, signed in or not, configured or not.
- New code goes in `src/cloud/`; existing files get only the hooks in spec §8.
- After a phase: `npx tsc --noEmit`, `npm run build`, browser check of the acceptance list, update the status here, then the user reviews.

Status: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Supabase and Google setup (user) `[x]`

Step-by-step Korean guide: [SETUP_GUIDE.md](SETUP_GUIDE.md). The user creates the project and the Google client and pastes the client secret into Supabase; Claude links the repo with the Supabase CLI, applies the schema and writes only the public key to `.env.local`.
Project: `lighting-aid-pipe` (ref `ijyzinbpxtoujwwotfrh`, ap-southeast-2) in a new `lighting-aid` organization. Steps 1–2 and the local `.env.local` are done (2026-10-21; RLS checked with anonymous REST calls: select returns `[]`, insert is rejected).

1. https://supabase.com → New project (free plan, any region near Korea, e.g. Northeast Asia (Seoul)). Keep the database password to yourself.
2. Schema: `supabase link --project-ref <ref>` + `supabase db push` applies `supabase/migrations/20261021000000_projects.sql` (or paste it into the SQL Editor).
3. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   - Authorized JavaScript origins: leave empty (Supabase does the redirect).
   - Authorized redirect URI: the callback shown in Supabase → Auth → Providers → Google (`https://<project-ref>.supabase.co/auth/v1/callback`).
   - OAuth consent screen: External, app name `조명 시뮬레이터`; while in *Testing* mode add club members as test users, or publish it.
4. Supabase → Auth → Providers → Google: enable, paste the client ID and client secret.
5. Supabase → Auth → URL Configuration: Site URL `https://haisung5414.github.io/2d-lighting-aid/`; Redirect URLs add `http://localhost:5173/**`, `http://localhost:5180/**` (the cloud worktree dev server) and `https://haisung5414.github.io/2d-lighting-aid/**`.
6. Supabase → Project Settings → API: copy the Project URL and the anon (or publishable) key.
   - Local: create `.env.local` in the repo root with `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`.
   - GitHub: repo → Settings → Secrets and variables → Actions → **Variables** → add the same two names.

Acceptance: the user can share the Project URL (not secret) and confirm `.env.local` exists.

Done notes: steps 3–6 done by the user on 2026-10-21 (Google client, Branding with `public/privacy.html`, app published, Supabase Google provider and redirect URLs, GitHub Variables).

## Phase 1 — Config, client and sign-in `[x]`

Spec §1, §2, §4, §6, §8.
- `@supabase/supabase-js` dependency; `src/cloud/config.ts` reads the env vars; `client.ts` creates the client lazily with dynamic `import()` (PKCE, persisted session).
- `auth.ts`: current user, `onAuthChange`, `signInWithGoogle()` (stores pending work first), `signOut()`; restores pending work after the redirect via `loadProjectData`.
- `manager.ts`: extract `loadProjectData(parsed, name)` from `loadFile`.
- `account.ts` + `cloud.css`: top-right `로그인` → sign-in dialog; signed-in account chip with menu (email, 로그아웃); landing-screen line.
- `.env.example`; `deploy.yml` passes the two variables.
- Not configured → `로그인` disabled with the spec title; Supabase chunk not requested.

Acceptance
- Without `.env.local`: app behaves exactly as before; no Supabase request in the network tab; `로그인` disabled.
- With `.env.local`: Google sign-in round trip works on `localhost:5173`; work open in the editor before sign-in is back afterwards; reload keeps the session; 로그아웃 returns to `로그인`.
- Local 불러오기 / 저장 unchanged. Typecheck and build pass; no console errors.

Done notes
- Checked in the browser: not configured (button disabled, no Supabase chunk requested); configured with a dummy project (login button, sign-in dialog, landing line); simulated return from sign-in (fake stored session + stashed dirty work → work restored with `저장 안 됨`, account chip and menu); sign-out keeps the work on screen. Real Google round trip tested on `localhost:5180` (2026-10-21): passkey sign-in, consent, return to the app with the open Humanities work restored (`저장 안 됨` kept), account chip with the Google avatar, session kept after reload. Supabase `/auth/v1/settings`: google on, email off. The Google consent screen shows `ijyzinbpxtoujwwotfrh.supabase.co` instead of the app name (no brand verification; expected). The Google app is published (In production) with only openid/email/profile.
- Supabase is a separate ~55 kB gzip chunk loaded only when configured.
- Dev server for this worktree: `cloud-dev` on port 5180 (5173/5174 are used by other sessions); `#account` gets `z-index: 21` so the account menu opens above the tray.
- `shell.ts`: `getFileState()` export; the `lighting:file` event accepts `dirty`. `manager.ts`: `loadProjectData(parsed, name)`.

## Phase 2 — Save online `[x]`

Spec §5.1, §5.2, §6.
- `projects.ts`: `saveOnline(name, asNew)` (insert / update / overwrite by name), size check, `openRow` tracking, `downloadCurrent`.
- `shell.ts` hooks: `askFileName`, `setCloudSaveHandler` (저장 / Ctrl+S / 다른 이름으로 저장 go online when the location is `cloud`), `location` in the `lighting:file` event and the save-state text; ☰ `작업 공간 바꾸기` → `홈으로`.
- `fileMenu.ts`: `온라인에 저장` (signed in, local work) and `내 컴퓨터에 내려받기` (signed in, online work).
- Overwrite confirmations (same name, newer remote copy). Sign-out switches the location to local.

Acceptance
- Signed in: saving creates a row with the same JSON as a local save; the pill shows `저장됨 · 온라인`; an edit shows `저장 안 됨 · 온라인`; Ctrl+S updates the same row.
- Signed out: 저장 downloads as before.

Done notes (2026-10-21, tested with the real account on `localhost:5180`)
- New work from Home → Ctrl+S asked the name in the pill → row inserted; F tool edit → `저장 안 됨 · 온라인` → Ctrl+S updated the same row (`updated_at` > `created_at`).
- 다른 이름으로 저장 → second row; saving as an existing name asked to overwrite and replaced that row; a remote change (row touched by a second request) triggered the "더 최근에 저장" question, and declining kept `저장 안 됨`.
- 기기에서 열기 while signed in → `저장됨 · 내 컴퓨터` with `온라인에 저장` in the menu → saved online → `저장됨 · 온라인`, menu shows `내 컴퓨터에 내려받기`.
- Not verified: reading another user's rows with a second real account (RLS was only checked as an anonymous visitor: select returns `[]`, insert is rejected).

## Phase 3 — Login screen and Home `[x]`

Spec §4.1, §4.2, §9 (replaces the planned project-list dialog; decided 2026-10-21 when the user asked for "login → dashboard → editor" in the SketchUp Web style).
- Migration `20261021010000_project_summary.sql`: generated `venue_key`, `scene_count`, `thumbnail` columns, so the list never downloads `data`.
- `home.ts` + `home.css`: login screen (Login.dc.html) and Home (Home.dc.html) drawn inside `#landing-screen`; the old landing card is hidden. Home: 새로 만들기 ▾, 기기에서 열기, sort and view toggles, 극장에서 시작 cards, 내 작업 cards with thumbnail, relative time, venue · 씬 N and a ⋯ menu (열기, 이름 바꾸기 inline, 내 컴퓨터에 내려받기, 삭제).
- `auth.ts`: `isAuthResolved()` (Home waits up to 4 s for the session check), `skipLogin` flag cleared on sign-out.
- `account.ts`: the landing line from Phase 1 is removed (Home replaces it).

Acceptance
- Signed out (configured) → login screen; "로그인 없이 시작하기" → local Home, remembered after reload; Google sign-in → Home with my projects.
- Clicking a project opens the exact work in the editor with location `cloud`; 홈으로 returns to Home and the list is reloaded.
- Not configured → local Home, no Supabase request.

Done notes (2026-10-21)
- All of the above checked in the browser with the real account, plus rename (inline, Enter) and delete (confirm) from the ⋯ menu, sort/view toggles, light and dark themes, desktop (1100–1280 px: 260 px nav, two cards per row) and narrow (722 px: nav becomes a top bar) layouts.
- The real sign-in from the **login screen** button was not repeated (sign-in itself was verified in Phase 1, from the editor dialog); the session was signed out at the end of testing, so the next start shows the login screen.
- Two test rows remain in the account: `자동시험 첫 저장`, `로컬에서 온 작업`.

## Phase 4 — Deploy check `[x]`

- After the user approves merging to `main` and pushing: confirm the GitHub Variables are set, the Pages build succeeds, and on `https://haisung5414.github.io/2d-lighting-aid/` sign-in, save online, list, open and sign-out all work; local save still works signed out.
- Update `PROJECT_BRIEF.md` (top bar / account, Home replaces the venue picker) and `UI_REDESIGN_SPEC.md` §2 / §8 (account area no longer a placeholder for 로그인; landing screen replaced by login + Home; ☰ `홈으로`).
- Merge note: `feature/sketchup-ui` also edits `index.html` and `src/ui/shell.ts`; the cloud hooks there are small (spec §8) and should be re-applied by hand if they conflict.

Done notes (2026-10-21)
- `main` had moved to 45cd618 (feature/sketchup-ui work); merged it into `feature/cloud-save` without conflicts (181f9fe), retested locally, then fast-forwarded `main` and pushed. Pages run 39519054858 succeeded.
- On https://haisung5414.github.io/2d-lighting-aid/: login screen with sign-in enabled (GitHub Variables reached the build), `privacy.html` 200, local mode (로그인 없이 시작하기 → new work → `내 컴퓨터`), real Google sign-in returning to the live site's Home with the two online projects, open → edit → Ctrl+S → `저장됨 · 온라인`, 홈으로 refreshes the list.
