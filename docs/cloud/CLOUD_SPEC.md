# Cloud Save Spec (sign-in + online projects)

Status: decisions made by the user on 2026-10-21. Implementation plan: [CLOUD_PHASES.md](CLOUD_PHASES.md).

## 0. Decisions

| Question | Decision |
|---|---|
| Who signs in | Each club member with their **own account**. Everyone sees and saves only their own projects. |
| Sign-in method | **Google** (OAuth through Supabase Auth). No email/password. |
| Sharing / co-editing | **Not now.** The `공유` button stays a disabled placeholder. |
| Backend | **Supabase** (free plan). The app stays a static GitHub Pages site; there is no server of our own. |

Supabase free plan (check https://supabase.com/pricing before relying on it): 50,000 monthly active users, 500 MB database, 2 active projects. **A free project is paused after 7 days without requests**; the owner must press *Restore* in the dashboard. While paused, sign-in and online save fail; local save keeps working (§7).

## 1. Principles

- **Local first stays.** Without signing in, everything works exactly as today: local JSON 불러오기 / 저장 / 다른 이름으로 저장, Ctrl+S.
- Online save stores **the same JSON as the local file** (`getState()`), and opening an online project goes through **the same load path** as opening a local file. There is one file format.
- Only the public **anon / publishable key** and the project URL are in the client. No service-role or secret key ever appears in the repo, the build or the browser. Access control is **Row Level Security**: a row is readable and writable only by `auth.uid() = user_id`.
- The account owner (the user) creates the Supabase project, the Google OAuth client and the keys. Claude never handles credentials.
- New code lives in `src/cloud/`. Existing files get only small hooks (§8), because `feature/sketchup-ui` is still editing the shell.
- UI copy is Korean; this document is English.

## 2. Configuration

| Name | Where | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (dev, git-ignored) and GitHub repo **Variables** (deploy) | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | same | the anon key or the newer publishable key (`sb_publishable_…`) |

- `.env.example` (committed) lists both names with empty values.
- `.github/workflows/deploy.yml` passes them to `npm run build` from `vars.*` (Variables, not Secrets: they are public by design, and Secrets would only hide them from logs).
- **If either is missing, cloud features are off**: the `로그인` button stays disabled with the title `온라인 저장이 설정되지 않았습니다`, no cloud menu items appear, and the Supabase library is never loaded.

Supabase dashboard settings (done by the user, §Phase 0 of the plan):
- Auth → Providers → Google: enabled with the Google OAuth client ID/secret (the secret lives only in Supabase).
- Auth → URL configuration: Site URL `https://haisung5414.github.io/2d-lighting-aid/`; Redirect URLs also include `http://localhost:5173/**`.

## 3. Database

One table. SQL lives in `docs/cloud/schema.sql`; the user runs it in the Supabase SQL editor.

```sql
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  data        jsonb not null check (octet_length(data::text) < 5000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.projects enable row level security;
-- select / insert / update / delete policies: to authenticated, using/with check (auth.uid() = user_id)
-- trigger: updated_at = now() on update
```

- `data` is the whole `AppState` JSON, the same object `saveProject` downloads.
- Names are unique per user, so "save with a name that already exists" is an overwrite question (§5.2).
- The 5 MB cap protects the 500 MB quota; the client checks the size first and shows a Korean error instead of a raw database error.

## 4. Sign-in

### 4.1 Where
- **Account area (top-right, `#account`)**
  - Signed out: `로그인` button (enabled when configured).
  - Signed in: the `로그인` button becomes an **account chip** (Google avatar or first letter + display name). Clicking it opens a small menu: the email (muted), `로그아웃`.
- **Landing screen**: below the venue cards, one line: signed out → `로그인하면 작업을 온라인에 저장하고 어디서나 열 수 있습니다.` + `Google로 로그인`; signed in → `<name> 님으로 로그인됨` + `온라인에서 열기` (Phase 3) + `로그아웃`.

### 4.2 Sign-in dialog
Clicking `로그인` in the top bar opens a small centred dialog (SketchUp Web shows a sign-in page; we keep it in-app):
- Title `로그인`; text `Google 계정으로 로그인하면 작업을 온라인에 저장하고 다른 컴퓨터에서도 열 수 있습니다. 로그인하지 않아도 내 컴퓨터에 저장하는 기능은 그대로 쓸 수 있습니다.`
- Button `Google로 로그인`; `닫기`.

### 4.3 Flow
- `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <app URL> } })` with PKCE (`flowType: 'pkce'`). `<app URL>` = `location.origin + import.meta.env.BASE_URL`.
- The page **leaves and comes back**. Before leaving, if the editor is open, the current state, file name and save location are put in `sessionStorage` (`lightingAid.cloud.pendingWork`); after returning and signing in, that work is restored through the normal load path, and the dirty flag is kept. If the editor is not open, nothing is stored and the landing screen shows again.
- The session persists in `localStorage` (Supabase default), so a reload stays signed in.
- `로그아웃` calls `signOut()`. The open work stays on screen; its save location becomes `내 컴퓨터` (online saving needs an account).

## 5. Online save

### 5.1 Save location
The open work has a **location**: `local` (default) or `cloud` (with the row `id` and the `updated_at` it was loaded/saved with).

| Action | Effect |
|---|---|
| 불러오기 (local file), 작업 공간 바꾸기 → new work | location `local` |
| 온라인에 저장 / 온라인에서 열기 | location `cloud` |
| **저장 / Ctrl+S** | saves to the current location: `local` → download as today; `cloud` → update that row |
| 다른 이름으로 저장 | unchanged: asks a name in place and downloads (location becomes `local`) |
| 로그아웃 | location becomes `local` |

Save-state text in the file pill: `저장 안 됨 · 온라인` / `저장됨 · 온라인` / `온라인` for cloud, today's `… · 내 컴퓨터` for local.

### 5.2 온라인에 저장
- File menu item, shown only when signed in (inserted after `다른 이름으로 저장`).
- If the work is untitled, the file name is asked in place in the file pill (same input as 다른 이름으로 저장), then saved.
- If a row with that name exists and it is **not** the open cloud project: `confirm('온라인에 같은 이름의 작업이 있습니다. 덮어쓸까요?')`.
- On success: location `cloud`, `저장됨 · 온라인`.
- Overwrite guard on 저장 to `cloud`: if the row's `updated_at` is newer than the one we hold (saved from another computer), `confirm('다른 곳에서 이 작업을 더 최근에 저장했습니다. 덮어쓸까요?')`.

### 5.3 온라인에서 열기 (project list)
- File menu item (signed in only) and a landing-screen button.
- Opens a dialog `내 온라인 작업`: one row per project, newest first: name, `수정 <relative time>` (e.g. `3분 전`, `어제`, `2026-10-01`), buttons `열기` and `삭제` (`삭제` asks `confirm('"<name>" 작업을 온라인에서 지울까요? 되돌릴 수 없습니다.')`).
- The list query selects `id, name, updated_at` only (not `data`); `열기` fetches `data` for that row.
- Empty list: `아직 온라인에 저장한 작업이 없습니다.`
- Opening asks first if the open work has unsaved changes (same wording as 작업 공간 바꾸기).
- Opening goes through the shared load function (§8), then location `cloud`.

## 6. States and errors

| Situation | Behaviour |
|---|---|
| Not configured | §2: cloud UI off, local save unchanged. |
| Network / paused project / RLS error | Korean `alert`: `온라인 작업을 처리하지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤에 다시 시도해 주세요.` + the error message in the console. Work on screen is untouched. |
| Session expired | Supabase refreshes tokens automatically; if a call still returns 401, the app shows the signed-out state and asks to sign in again. |
| Too large (> 5 MB) | `작업 파일이 너무 커서 온라인에 저장할 수 없습니다 (최대 5MB). 배경 이미지를 줄이거나 내 컴퓨터에 저장해 주세요.` |

## 7. Out of scope

Sharing links, co-editing, folders, version history, thumbnails, offline queueing, autosave, other sign-in providers. The `공유` button stays disabled.

## 8. Touch points in existing files

Kept minimal so `feature/sketchup-ui` merges cleanly.

| File | Change |
|---|---|
| `index.html` | `id="account"` on the account div; the `로그인` button gets `id="login-btn"`. |
| `src/main.ts` | one `initCloud()` call. |
| `src/ui/manager.ts` | extract the body of `loadFile` into exported `loadProjectData(parsed, name)`; `loadFile` calls it. |
| `src/ui/shell.ts` | (a) export a way to ask the file name in place and get it back; (b) `saveCurrent` delegates to a registered save handler when the location is `cloud`; (c) the `lighting:file` event gains an optional `location` and the save-state text uses it; (d) `dirty` exposed through a getter. |
| `.github/workflows/deploy.yml` | `env:` with the two `VITE_SUPABASE_*` variables on the build step. |
| `package.json` | dependency `@supabase/supabase-js` (loaded with dynamic `import()` only when configured). |

New: `src/cloud/config.ts`, `client.ts` (lazy client), `auth.ts` (session state, sign-in/out, pending-work handoff), `account.ts` (top-right chip, dialog, landing line), `projects.ts` (list/get/save/delete), `projectDialog.ts`, `cloud.css`, `index.ts` (`initCloud`).
