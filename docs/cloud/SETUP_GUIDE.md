# 온라인 저장 설정 안내 (Supabase + Google 로그인)

이 문서는 계정 주인이 직접 따라 하는 설정 순서를 한국어로 자세히 적은 안내서입니다. 사양은 [CLOUD_SPEC.md](CLOUD_SPEC.md), 단계는 [CLOUD_PHASES.md](CLOUD_PHASES.md)의 Phase 0입니다.

전체 그림은 다음과 같습니다.

```
조명 앱 ──(Google로 로그인 버튼)──▶ Supabase ──▶ Google 로그인 화면
   ▲                                  │                │
   └──── 로그인 완료, 앱으로 돌아옴 ◀──┴── 콜백 주소 ◀───┘
```

- 앱은 Supabase에게만 말을 겁니다. Google과 직접 이야기하는 쪽은 Supabase입니다.
- 그래서 Google에는 **"로그인이 끝나면 Supabase의 콜백 주소로 돌려보내라"**는 것만 등록하면 됩니다.
- Supabase에는 **Google이 발급한 클라이언트 ID와 비밀번호(client secret)**, 그리고 **로그인 뒤 돌아갈 앱 주소**를 등록합니다.

누가 무엇을 하는지는 아래처럼 나눕니다.

| 단계 | 하는 사람 | 이유 |
|---|---|---|
| A. 새 프로젝트 만들기 | 사용자 (대시보드) | 데이터베이스 비밀번호를 정해야 하기 때문 |
| B. 표(테이블)와 보안 규칙 만들기, 공개 키를 `.env.local`에 넣기 | Claude (Supabase CLI) | 공개 키만 다루고, 비밀 키는 쓰지 않음 |
| C. Google OAuth 클라이언트 만들기 | 사용자 (Google Cloud 콘솔) | Google 계정 작업이고 client secret이 나오기 때문 |
| D. Supabase에 Google 정보와 돌아갈 주소 넣기 | 사용자 (대시보드) | client secret을 붙여 넣기 때문 |
| E. GitHub 저장소에 변수 두 개 넣기 | 사용자 (GitHub) | 저장소 설정 변경 |

---

## A. Supabase 프로젝트 만들기

### A-1. 만들 자리 비우기 (끝남)
무료 요금제는 켜 둘 수 있는 프로젝트 수가 정해져 있습니다. FindMeATime은 일시 정지할 권한이 없어서, 대신 `caltalk-mvp` 조직에 있던 안 쓰는 프로젝트(haisung5414's Project)를 지웠습니다(2026-10-21). 결국 `lighting-aid` 조직을 새로 만들어 그 안에 프로젝트를 만들었습니다.

### A-2. 새 프로젝트 만들기
1. 대시보드 첫 화면에서 **New project**를 누릅니다.
2. 다음처럼 채웁니다.
   - Organization: `lighting-aid` (새로 만든 조직)
   - Project name: `lighting-aid-pipe`
   - Database password: **Generate a password**를 누르고, 나온 비밀번호를 비밀번호 관리자에 보관합니다. 이 비밀번호는 Claude에게 알려 주지 않아도 됩니다.
   - Region: **Northeast Asia (Seoul)**
   - 그 밖의 항목은 기본값 그대로 둡니다.
3. **Create new project**를 누르고, 준비가 끝날 때까지 1~2분 기다립니다.
4. 다 만들어지면 Claude에게 "만들었어"라고 알려 주세요. Claude가 **B 단계**를 CLI로 진행합니다.

---

## B. 표와 보안 규칙, 공개 키 (Claude가 진행)

Claude가 다음을 합니다. 사용자는 결과만 확인하면 됩니다.

1. `supabase link`로 저장소와 새 프로젝트를 연결합니다. 데이터베이스 비밀번호를 물으면, 그 칸은 사용자가 직접 입력합니다.
2. `supabase/migrations/20261021000000_projects.sql` 내용을 마이그레이션으로 올려서 `projects` 표와 RLS(자기 행만 읽고 쓰는 규칙)를 만듭니다.
3. `supabase projects api-keys`에서 **공개용 키(publishable 또는 anon)만** 골라 워크트리의 `.env.local`에 넣습니다. `service_role`/secret 키는 화면에 띄우지도, 파일에 넣지도 않습니다.

**끝남 (2026-10-21).** 프로젝트는 `lighting-aid` 조직의 `lighting-aid-pipe`(지역: Sydney, ap-southeast-2)입니다. 표와 RLS를 만들었고, 로그인하지 않은 방문자는 행을 읽지도 넣지도 못하는 것을 확인했습니다. `.env.local`에는 publishable 키를 넣었습니다.

C·D·E 단계에서 쓸 값은 다음과 같습니다. 모두 공개해도 되는 값입니다.

| 이름 | 값 |
|---|---|
| 프로젝트 주소 (E 단계 `VITE_SUPABASE_URL`) | `https://ijyzinbpxtoujwwotfrh.supabase.co` |
| 콜백 주소 (C-5 단계 리디렉션 URI) | `https://ijyzinbpxtoujwwotfrh.supabase.co/auth/v1/callback` |
| 공개 키 (E 단계 `VITE_SUPABASE_ANON_KEY`) | `sb_publishable_OHfSmbRSq5UwO7ggC1o6Cw_Idmlnx5x` |

---

## C. Google OAuth 클라이언트 만들기 (가장 헷갈리는 부분)

Google 쪽에서 만드는 것은 세 가지뿐입니다.

1. **Google Cloud 프로젝트**: 설정을 담아 둘 상자
2. **동의 화면(Branding/Audience)**: 로그인할 때 "조명 시뮬레이터가 내 이름과 이메일을 보려고 합니다"라고 보여 주는 화면
3. **OAuth 클라이언트**: Supabase가 Google에 자신을 소개할 때 쓰는 ID와 비밀번호

Google Cloud 콘솔의 메뉴 이름은 가끔 바뀝니다. 아래 이름이 보이지 않으면 위쪽 검색창에 **"Google Auth Platform"**을 입력하면 같은 곳으로 갑니다.

### C-1. Google Cloud 프로젝트 만들기
1. https://console.cloud.google.com 에 동아리 관리용으로 쓸 Google 계정으로 로그인합니다.
2. 처음이라면 이용약관 동의 창이 뜹니다. 국가를 고르고 동의합니다.
3. 화면 맨 위 왼쪽, Google Cloud 로고 옆의 **프로젝트 선택 상자**(처음에는 "프로젝트 선택" 또는 다른 프로젝트 이름)를 누릅니다.
4. 뜬 창의 오른쪽 위 **새 프로젝트(NEW PROJECT)**를 누릅니다.
5. 프로젝트 이름: `lighting-aid`, 조직/위치: "조직 없음" 그대로 → **만들기**.
6. 만든 뒤 위쪽 프로젝트 선택 상자에 `lighting-aid`가 보이는지 확인합니다. 다른 프로젝트가 보이면 눌러서 `lighting-aid`로 바꿉니다. **이후 모든 작업은 이 프로젝트가 선택된 상태에서 합니다.**

### C-2. 동의 화면 만들기 (Google Auth Platform → 시작하기)
1. 왼쪽 위 ☰ 메뉴 → **API 및 서비스 → OAuth 동의 화면**을 누릅니다. (또는 검색창에 "Google Auth Platform")
2. "Google Auth Platform이 아직 구성되지 않았습니다"라는 화면에서 **시작하기(GET STARTED)**를 누릅니다.
3. 네 칸짜리 마법사가 나옵니다.
   1. **앱 정보**
      - 앱 이름: `조명 시뮬레이터`
      - 사용자 지원 이메일: 내 Gmail 주소를 고릅니다.
      - **다음**
   2. **대상(Audience)**: **외부(External)**를 고릅니다. (내부는 회사·학교 Workspace 관리자만 고를 수 있습니다.) → **다음**
   3. **연락처 정보**: 내 이메일 주소를 적습니다. → **다음**
   4. **완료**: "Google API 서비스: 사용자 데이터 정책에 동의합니다"에 체크 → **계속** → **만들기**
4. **로고는 올리지 마세요.** 로고를 올리면 Google의 앱 검수를 받아야 해서 몇 주가 걸릴 수 있습니다.

### C-3. 받을 정보 범위(Data Access) 확인
1. 왼쪽 메뉴에서 **데이터 액세스(Data Access)**를 누릅니다.
2. **범위 추가 또는 삭제(ADD OR REMOVE SCOPES)**를 누르고, 목록에서 다음 세 개에 체크합니다.
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
3. 창 아래 **업데이트** → 화면 아래 **저장(SAVE)**.
4. 이 세 개는 "민감하지 않은 범위"라서 검수가 필요 없습니다. 다른 범위는 추가하지 마세요.

### C-4. 누가 로그인할 수 있게 할지 정하기 (Audience)
1. 왼쪽 메뉴에서 **대상(Audience)**을 누릅니다.
2. 게시 상태가 **테스트(Testing)**로 되어 있습니다. 둘 중 하나를 고릅니다.
   - **앱 게시(PUBLISH APP) 누르기 (추천)**: 아무 Google 계정이나 로그인할 수 있습니다. 위의 세 범위만 쓰고 로고가 없으면 검수 없이 바로 "프로덕션" 상태가 됩니다. 확인 창에서 **확인**을 누릅니다.
   - **테스트 상태로 두기**: 아래 **테스트 사용자 → + ADD USERS**에 동아리원 Gmail 주소를 한 명씩 넣어야 하고(최대 100명), 넣지 않은 사람은 로그인할 수 없습니다.
3. 게시해도 로그인 화면에 "Google에서 확인하지 않은 앱" 경고가 뜨지 않는 것이 보통입니다. 만약 뜨면 **고급 → 조명 시뮬레이터(으)로 이동**을 누르면 되고, 이 내용을 Claude에게 알려 주세요.

### C-5. OAuth 클라이언트 만들기 (Clients)
1. 왼쪽 메뉴에서 **클라이언트(Clients)**를 누르고 **+ 클라이언트 만들기(CREATE CLIENT)**를 누릅니다.
2. 다음처럼 채웁니다.
   - 애플리케이션 유형: **웹 애플리케이션(Web application)**
   - 이름: `lighting-aid supabase`
   - **승인된 자바스크립트 원본(Authorized JavaScript origins)**: 비워 둡니다. (이 앱은 Google 버튼을 직접 띄우지 않고 Supabase를 거치므로 필요 없습니다.)
   - **승인된 리디렉션 URI(Authorized redirect URIs)** → **+ URI 추가** → B 단계에서 받은 **콜백 주소**를 정확히 붙여 넣습니다.
     ```
     https://ijyzinbpxtoujwwotfrh.supabase.co/auth/v1/callback
     ```
     앞뒤 공백, 끝의 `/` 하나 차이도 오류(`redirect_uri_mismatch`)가 납니다. 조명 앱 주소(github.io)나 localhost는 **여기에 넣지 않습니다.** 그 주소들은 D 단계에서 Supabase에 넣습니다.
3. **만들기**를 누르면 **클라이언트 ID**와 **클라이언트 보안 비밀번호(Client secret)**가 담긴 창이 뜹니다.
   - **보안 비밀번호는 이 창에서만 볼 수 있습니다.** 창을 닫기 전에 **JSON 다운로드**를 누르거나, 두 값을 비밀번호 관리자에 복사해 둡니다.
   - 클라이언트 ID는 `숫자-영문.apps.googleusercontent.com` 모양이고, 보안 비밀번호는 `GOCSPX-`로 시작합니다.
   - 둘 다 Claude나 채팅에 붙여 넣지 마세요. D 단계에서 Supabase 대시보드에만 넣습니다.
4. 보안 비밀번호를 놓쳤다면, 그 클라이언트를 눌러 **보안 비밀번호 추가(Add secret)**로 새로 만들면 됩니다.

---

## D. Supabase에 Google 정보와 돌아갈 주소 넣기

### D-1. Google 로그인 켜기
1. Supabase 대시보드 → `lighting-aid` 프로젝트 → 왼쪽 **Authentication** → **Sign In / Providers**(예전 이름 Providers)로 갑니다.
2. 목록에서 **Google**을 눌러 펼칩니다.
3. **Enable Sign in with Google**을 켭니다.
4. **Client IDs**: C-5에서 받은 클라이언트 ID를 붙여 넣습니다.
5. **Client Secret (for OAuth)**: C-5에서 받은 보안 비밀번호(`GOCSPX-…`)를 붙여 넣습니다.
6. 아래에 보이는 **Callback URL (for OAuth)**가 C-5에 넣은 주소와 똑같은지 한 번 더 확인합니다.
7. **Save**.

### D-2. 이메일 가입 끄기 (선택, 추천)
같은 **Sign In / Providers** 화면에서 **Email**을 눌러 **Enable Email provider**를 끄고 저장합니다. Google 로그인만 쓰므로, 다른 사람이 공개 키로 이메일 계정을 만드는 길을 막아 둡니다. ("Allow new users to sign up" 스위치는 끄지 마세요. 그걸 끄면 Google로 처음 로그인하는 동아리원도 막힙니다.)

### D-3. 로그인 뒤 돌아갈 주소
1. 왼쪽 **Authentication → URL Configuration**으로 갑니다.
2. **Site URL**: `https://haisung5414.github.io/2d-lighting-aid/` → **Save**.
3. **Redirect URLs → Add URL**로 다음 세 줄을 하나씩 넣고 저장합니다.
   ```
   https://haisung5414.github.io/2d-lighting-aid/**
   http://localhost:5173/**
   http://localhost:5180/**
   ```
   (5180은 이 작업용 워크트리의 개발 서버, 5173은 원래 저장소의 개발 서버입니다.)

---

## E. GitHub 저장소 변수 (배포 사이트용)

배포 사이트가 Supabase를 쓰려면 빌드할 때 주소와 공개 키가 필요합니다.

1. https://github.com/haisung5414/2d-lighting-aid → **Settings** → 왼쪽 **Secrets and variables → Actions**.
2. **Variables** 탭(Secrets 탭이 아닙니다) → **New repository variable**로 두 개를 만듭니다.
   - `VITE_SUPABASE_URL` = `https://ijyzinbpxtoujwwotfrh.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_OHfSmbRSq5UwO7ggC1o6Cw_Idmlnx5x`
3. 이 값들은 브라우저에 그대로 내려가는 공개용 값이라 Variables에 두어도 됩니다. 보호는 RLS가 맡습니다.

---

## 끝난 뒤 확인

1. Claude가 워크트리 개발 서버(http://localhost:5180)를 띄웁니다.
2. 앱 오른쪽 위 **로그인 → Google로 로그인**을 누르고, 내장 브라우저 창에서 직접 Google 계정을 고릅니다.
3. 앱으로 돌아와 오른쪽 위에 내 이름이 보이면 성공입니다.

### 자주 나는 오류

| 화면에 보이는 것 | 원인과 해결 |
|---|---|
| Google 화면에 `Error 400: redirect_uri_mismatch` | C-5의 리디렉션 URI가 Supabase 콜백 주소와 다릅니다. 글자 하나까지 똑같이 맞춥니다. |
| Google 화면에 `Access blocked: … has not completed the Google verification process` | 앱이 테스트 상태인데 테스트 사용자에 없는 계정입니다. C-4에서 게시하거나 그 계정을 테스트 사용자로 넣습니다. |
| 로그인 뒤 앱이 아니라 엉뚱한 주소(Site URL)로 돌아감 | D-3의 Redirect URLs에 지금 쓰는 주소(포트까지)가 없습니다. |
| Supabase 쪽 `Unsupported provider: provider is not enabled` | D-1에서 Google을 켜고 Save를 눌렀는지 확인합니다. |
| 일주일 뒤 갑자기 로그인이 안 됨 | 무료 프로젝트가 7일 동안 쓰이지 않아 일시 정지된 것입니다. 대시보드에서 **Restore**를 누릅니다. |
