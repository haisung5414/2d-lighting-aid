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

## Phase 0 — Supabase and Google setup (user) `[ ]`

Done by the user; Claude does not touch accounts or keys.

1. https://supabase.com → New project (free plan, any region near Korea, e.g. Northeast Asia (Seoul)). Keep the database password to yourself.
2. SQL Editor → paste `docs/cloud/schema.sql` → Run.
3. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
   - Authorized JavaScript origins: `https://haisung5414.github.io`, `http://localhost:5173`, `http://localhost:5180`.
   - Authorized redirect URI: the callback shown in Supabase → Auth → Providers → Google (`https://<project-ref>.supabase.co/auth/v1/callback`).
   - OAuth consent screen: External, app name `조명 시뮬레이터`; while in *Testing* mode add club members as test users, or publish it.
4. Supabase → Auth → Providers → Google: enable, paste the client ID and client secret.
5. Supabase → Auth → URL Configuration: Site URL `https://haisung5414.github.io/2d-lighting-aid/`; Redirect URLs add `http://localhost:5173/**`, `http://localhost:5180/**` (the cloud worktree dev server) and `https://haisung5414.github.io/2d-lighting-aid/**`.
6. Supabase → Project Settings → API: copy the Project URL and the anon (or publishable) key.
   - Local: create `.env.local` in the repo root with `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`.
   - GitHub: repo → Settings → Secrets and variables → Actions → **Variables** → add the same two names.

Acceptance: the user can share the Project URL (not secret) and confirm `.env.local` exists.

## Phase 1 — Config, client and sign-in `[~]`

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

Done notes (awaiting real sign-in test after Phase 0)
- Checked in the browser: not configured (button disabled, no Supabase chunk requested); configured with a dummy project (login button, sign-in dialog, landing line); simulated return from sign-in (fake stored session + stashed dirty work → work restored with `저장 안 됨`, account chip and menu); sign-out keeps the work on screen. The real Google round trip is not tested yet.
- Supabase is a separate ~55 kB gzip chunk loaded only when configured.
- Dev server for this worktree: `cloud-dev` on port 5180 (5173/5174 are used by other sessions); `#account` gets `z-index: 21` so the account menu opens above the tray.
- `shell.ts`: `getFileState()` export; the `lighting:file` event accepts `dirty`. `manager.ts`: `loadProjectData(parsed, name)`.

## Phase 2 — Save online `[ ]`

Spec §5.1, §5.2, §6.
- `projects.ts`: `saveProjectOnline(name, data, {id?, expectedUpdatedAt?})`, `findByName`, size check.
- `shell.ts` hooks: ask-name-in-place helper, cloud save handler for 저장/Ctrl+S, `location` in the `lighting:file` event and save-state text.
- File menu: `온라인에 저장` (signed in only).
- Overwrite confirmations (same name, newer remote copy). Sign-out switches the location to local.

Acceptance
- Signed in: 온라인에 저장 creates a row (visible in Supabase Table Editor) with the same JSON as a local save; the pill shows `저장됨 · 온라인`; an edit shows `저장 안 됨 · 온라인`; Ctrl+S updates the same row.
- A second user (or SQL with another uid) cannot read the row (RLS check in the SQL editor with `set role authenticated` + a fake `request.jwt.claims`).
- Signed out: 저장 downloads as today.

## Phase 3 — Open online (project list) `[ ]`

Spec §5.3, §6.
- `projectDialog.ts`: `내 온라인 작업` dialog, newest first, relative time, 열기 / 삭제, empty state, unsaved-changes question.
- File menu `온라인에서 열기` and the landing-screen button.

Acceptance
- The list shows only my projects; 열기 restores the exact work (fixtures, sets, scenes, venue) and sets the location to cloud; 삭제 removes the row after confirmation.
- Works from the landing screen (no editor open yet).

## Phase 4 — Deploy check `[ ]`

- After the user approves merging to `main` and pushing: confirm the GitHub Variables are set, the Pages build succeeds, and on `https://haisung5414.github.io/2d-lighting-aid/` sign-in, save online, list, open and sign-out all work; local save still works signed out.
- Update `PROJECT_BRIEF.md` (top bar / account) and spec §8 of `UI_REDESIGN_SPEC.md` (account area no longer a placeholder for 로그인).
