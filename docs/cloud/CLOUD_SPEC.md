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
- Auth → URL configuration: Site URL `https://haisung5414.github.io/2d-lighting-aid/`; Redirect URLs also include `http://localhost:5173/**` and `http://localhost:5180/**`.

## 3. Database

One table. SQL lives in `supabase/migrations/20261021000000_projects.sql`, applied with `supabase db push`.

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

Second migration (`20261021010000_project_summary.sql`, added 2026-10-21 for the home screen): three **generated columns** computed from `data`, so the home list never downloads whole projects:

```sql
venue_key   text generated always as (data->'stage_config'->>'venue_key') stored
scene_count int  generated always as (jsonb_array_length(data->'cues')) stored
thumbnail   text generated always as (coalesce(data->'cues'->((data->>'active_cue_index')::int)->>'thumbnail',
                                               data->'cues'->0->>'thumbnail')) stored
```

- `data` is the whole `AppState` JSON, the same object `saveProject` downloads. Scene thumbnails (`cue.thumbnail`, a 160 px JPEG data URL made by `generateThumbnail`) are already inside it.
- Names are unique per user, so "save with a name that already exists" is an overwrite question (§5.2).
- The 5 MB cap protects the 500 MB quota; the client checks the size first and shows a Korean error instead of a raw database error.

## 4. Sign-in

### 4.1 Screens (decided 2026-10-21, replaces the landing-line idea)
The old landing card (venue picker) is replaced by two screens drawn inside `#landing-screen` (so every existing "show landing / show editor" path keeps working). Visual reference: `docs/design/sketchup-redesign/Login.dc.html` and `Home.dc.html` (SketchUp Web's sign-in page and Home hub).

| Situation | Screen |
|---|---|
| Configured, signed out, never chose "without signing in" | **Login screen** (§4.2) |
| Signed in | **Home** (§9) with my online projects |
| Signed out after choosing "without signing in", or not configured | **Home** in local mode: no project list; a card invites to sign in (configured only) |

- While the session is being checked (Supabase loads lazily), `#landing-screen` shows only its background (max 4 s, then local Home).
- **Account area in the editor (top-right, `#account`)**: signed out → `로그인` (opens the sign-in dialog §4.4); signed in → **account chip** (avatar + name) with a menu: email, `로그아웃`.

### 4.2 Login screen
Two columns like the mockup (the right column stacks under the left on narrow screens):
- Left: a light illustration (stage spot + aim line) and the headline `무대 조명을` / **`미리 그려 보세요.`** with a blue rule.
- Right: logo + `Lighting Aid`, small `조명 시뮬레이터`, heading `환영합니다`, an outlined square **`Google로 계속 진행`** button with the Google "G", the link **`로그인 없이 시작하기 (이 기기에 저장)`**, and at the bottom `개인정보처리방침` (→ `privacy.html`).
- "로그인 없이 시작하기" stores `lightingAid.cloud.skipLogin = 1` in `localStorage` and shows Home in local mode. Signing out clears it.

### 4.3 Flow
- `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <app URL> } })` with PKCE (`flowType: 'pkce'`). `<app URL>` = `location.origin + import.meta.env.BASE_URL`.
- The page **leaves and comes back**, and Home shows after returning. The open work is **not** restored (changed 2026-10-21 by the user: the earlier sessionStorage hand-off was removed); the editor warns first when there are unsaved changes (§4.4).
- The session persists in `localStorage` (Supabase default), so a reload stays signed in.
- `로그아웃` calls `signOut({ scope: 'local' })`. An open work stays on screen; its save location becomes `내 컴퓨터` (online saving needs an account).

### 4.4 Signing in from the editor (changed 2026-10-21)
`로그인` in the editor's top bar:
- No unsaved changes → goes straight to Google sign-in.
- Unsaved changes → a centred warning dialog: title `저장하지 않은 작업이 있습니다`, text `로그인하면 Google 로그인 화면으로 넘어갔다가 홈으로 돌아옵니다. 지금 작업에서 저장하지 않은 내용은 사라집니다. 남기려면 먼저 ☰ 메뉴에서 저장해 주세요.`, buttons `취소` / `저장하지 않고 로그인` (red).

## 5. Online save

### 5.1 Save location
The open work has a **location**: `local` or `cloud` (with the row `id` and the `updated_at` it was loaded/saved with; a new cloud work has no id yet).

| Action | Location |
|---|---|
| Home → 새로 만들기 / venue card while **signed in** | `cloud` (untitled, no row yet) |
| Home → 새로 만들기 / venue card while signed out | `local` |
| 기기에서 열기 / 불러오기 (local file) | `local` |
| Home → open a project card | `cloud` |
| 온라인에 저장 | `cloud` |
| 로그아웃 | `local` |

| Command | `local` | `cloud` |
|---|---|---|
| **저장 / Ctrl+S** | download JSON (as before) | untitled → ask the name in place, then insert; else update the row |
| **다른 이름으로 저장** | ask name, download | ask name, save as a **new** row (the open work switches to it) |
| **온라인에 저장** (signed in, local only) | ask name if untitled, save online → `cloud` | hidden |
| **내 컴퓨터에 내려받기** (signed in, cloud only) | hidden | download JSON; location stays `cloud` |

Save-state text in the file pill: `저장 안 됨 · 온라인` / `저장됨 · 온라인` / `온라인` for cloud, the existing `… · 내 컴퓨터` for local.

Going back to Home: the **집 (home) button** left of the file pill (it replaced the ☰ item `홈으로`, formerly `작업 공간 바꾸기`, on 2026-10-21); it asks only when there are unsaved changes.

### 5.2 Overwrite questions
- Saving under a name that another of my rows already has: `confirm('온라인에 같은 이름의 작업이 있습니다. 덮어쓸까요?')`. Yes → that row is replaced (the open work takes it over).
- 저장 to `cloud` when the row's `updated_at` differs from the one we hold (saved from another computer): `confirm('다른 곳에서 이 작업을 더 최근에 저장했습니다. 덮어쓸까요?')`.
- The row was deleted elsewhere: it is inserted again.

### 5.3 Opening
Online projects are opened from Home (§9); there is no separate dialog. Opening goes through `loadProjectData` (§8), then location `cloud`.

## 6. States and errors

| Situation | Behaviour |
|---|---|
| Not configured | §2: cloud UI off, local save unchanged. |
| Network / paused project / RLS error | Korean `alert`: `온라인 작업을 처리하지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤에 다시 시도해 주세요.` + the error message in the console. Work on screen is untouched. |
| Session expired | Supabase refreshes tokens automatically; if a call still returns 401, the app shows the signed-out state and asks to sign in again. |
| Too large (> 5 MB) | `작업 파일이 너무 커서 온라인에 저장할 수 없습니다 (최대 5MB). 배경 이미지를 줄이거나 내 컴퓨터에 저장해 주세요.` |

## 7. Out of scope

Sharing links, co-editing, folders, version history, offline queueing, autosave, other sign-in providers, search on Home, and the mockup's 내 프로젝트 / 극장 라이브러리 / 튜토리얼 nav items. The `공유` button stays disabled.

## 8. Touch points in existing files

Kept minimal so `feature/sketchup-ui` merges cleanly.

| File | Change |
|---|---|
| `index.html` | `id="account"` on the account div; the `로그인` button gets `id="login-btn"`; the ☰ item `작업 공간 바꾸기` became the 집 button `#home-btn` left of the file pill. The old landing card stays in the DOM but is hidden by `src/cloud/home.css`. |
| `src/main.ts` | one `initCloud()` call. |
| `src/ui/manager.ts` | extract the body of `loadFile` into exported `loadProjectData(parsed, name)`; `loadFile` calls it. |
| `src/ui/shell.ts` | (a) export a way to ask the file name in place and get it back; (b) `saveCurrent` delegates to a registered save handler when the location is `cloud`; (c) the `lighting:file` event gains an optional `location` and the save-state text uses it; (d) `dirty` exposed through a getter. |
| `.github/workflows/deploy.yml` | `env:` with the two `VITE_SUPABASE_*` variables on the build step. |
| `package.json` | dependency `@supabase/supabase-js` (loaded with dynamic `import()` only when configured). |

New: `src/cloud/config.ts`, `client.ts` (lazy client), `auth.ts` (session state, sign-in/out, pending-work handoff), `account.ts` (editor top-right chip, sign-in dialog), `projects.ts` (list/get/save/rename/delete, open, download), `fileMenu.ts` (extra ☰ items), `home.ts` + `home.css` (login screen and Home), `cloud.css`, `index.ts` (`initCloud`).

## 9. Home (decided 2026-10-21)

Layout from `Home.dc.html` (SketchUp Web Home): white left nav + light grey main area; the dark theme uses the shell tokens.

- **Left nav**: logo `Lighting Aid`; one item `홈` (active); at the bottom `개인정보처리방침`.
- **Header row**: title `홈`; right: account chip + menu (signed in) or `로그인` (signed out, configured).
- **Action row**: `새로 만들기 ▾` (menu of venues) · `기기에서 열기` (local JSON) · right side: sort toggle (`최근 수정순` / `이름순`) and view toggle (grid / list), both remembered in `localStorage`.
- **극장에서 시작**: one card per venue preset: 인문소극장 (floor-plan image), 빈 무대 (dashed square); meta `12 × 22.7 m`. Click = new work on that venue (§5.1).
- **내 작업** (signed in): one card per online project: thumbnail (scene thumbnail or a placeholder), name, `마지막 수정: 3분 전` (relative for today/yesterday, else `2026. 10. 19.`), cloud icon, `<venue> · 씬 N`, `⋯` menu: `열기`, `이름 바꾸기` (inline input on the card), `내 컴퓨터에 내려받기`, `삭제` (`confirm('"<name>" 작업을 온라인에서 지울까요? 되돌릴 수 없습니다.')`). Clicking the card opens it.
  - Loading: `불러오는 중…`; empty: `아직 온라인에 저장한 작업이 없습니다. 위의 새로 만들기로 시작해 보세요.`; error: the §6 message with `다시 시도`.
- **Signed out**: instead of 내 작업, a card `로그인하면 작업을 온라인에 저장하고 어느 컴퓨터에서나 이어서 할 수 있습니다.` + `Google로 로그인` (configured), or a note that work is saved as a JSON file on this computer (not configured).
- The list reloads whenever Home becomes visible and after every online save.
