# IMPLEMENTATION AUDIT: 문서와 실제 코드 대조

작성일: 2026-05-10

## 점검 범위

다음 문서를 먼저 읽고 프로젝트 맥락을 확인한 뒤, 실제 파일 트리와 코드를 대조했다.

- `CODEX_HANDOFF.md`
- `PROJECT_BRIEF.md`
- `DECISIONS.md`
- `NEXT_TASKS.md`

코드는 수정하지 않고 확인만 수행했다. 타입 검사는 `tsc --noEmit` 기준으로 통과했다.

## 실제 존재 확인된 핵심 파일

문서에 적힌 핵심 파일은 실제로 존재한다.

- `index.html`
- `package.json`
- `tsconfig.json`
- `src/main.ts`
- `src/style.css`
- `src/types/index.ts`
- `src/state/store.ts`
- `src/engine/geometry.ts`
- `src/render/canvas.ts`
- `src/ui/manager.ts`
- `src/ui/scene.ts`
- `src/ui/fixture.ts`

추가로 실제 트리에는 문서에 없는 Vite 기본 잔여 파일도 있다.

- `src/counter.ts`
- `src/assets/hero.png`
- `src/assets/typescript.svg`
- `src/assets/vite.svg`

## 문서와 실제 코드의 불일치

| 항목 | 문서 내용 | 실제 코드 | 권장 조치 |
|---|---|---|---|
| 전역 스타일 | `src/style.css`가 전역 스타일이라고 설명 | 파일은 있지만 `src/main.ts`에서 import하지 않는다. 실제 스타일 대부분은 `index.html`의 인라인 `<style>`에 있다. | 확인 필요 |
| 듀얼 배경 레이어 | `DECISIONS.md`에는 Layer 0 극장 도면 + Layer 1 씬 도면 구조가 확정처럼 적혀 있다. | `StageConfig`에 `venue_map`이 없고, `canvas.ts`는 `cue.background` 1개만 렌더링한다. | 코드 추가 필요 |
| 렌더링 순서 | 듀얼 구조 기준 `[Layer 0] -> [Layer 1] -> [그리드] -> [조명]` 순서가 필요하다고 설명 | 현재는 `renderCanvas`에서 그리드를 먼저 그리고, 그 뒤 `drawCueToContext`가 씬 배경을 그린다. | 코드 추가 필요 |
| 썸네일 핸들 제외 | 썸네일에서는 파란 네모나 노란 원 같은 조작 핸들이 렌더링되지 않아야 한다고 설명 | `selectedFixtureId`를 `null`로 넘기지만, 선택 강조만 빠지고 fixture/target 마커는 계속 그려진다. | 코드 수정 필요 |
| Undo/Redo 완벽 지원 | 현재 구현 기능에 Undo/Redo 완벽 지원이라고 적혀 있다. | 조명/씬 변경은 대체로 히스토리를 저장하지만, 전역 토글과 무대 크기 변경은 히스토리 저장이 없다. | 문서 수정 또는 코드 추가 필요 |
| 히스토리 저장 원칙 | UI 변경 직전 한 번만 `commitHistory()`를 호출해야 한다고 설명 | `edge_softness` range 입력은 `oninput`마다 `commitHistory()`가 호출될 수 있다. | 코드 수정 필요 |
| 시작 화면 | `#landing-screen`, `#editor-screen` 도입 예정 | 아직 존재하지 않는다. | 정상, P0 Task 2에서 코드 추가 |
| 극장 프리셋 | `src/config/venues.ts` 신규 생성 예정 | 아직 존재하지 않는다. | 정상, P0 Task 1에서 코드 추가 |
| 각도 시각화 | `calculateAngles(fixture)`, `tilt-ref.png`, `pan-ref.png` 예정 | 함수와 이미지 파일 모두 아직 없다. | 정상, P1 작업 전 에셋 확인 필요 |
| 채널/패치 | `channel?: number`, `src/ui/patch.ts`, `getGlobalPatchMap()` 예정 | 모두 아직 없다. | 정상, P1/P2에서 코드 추가 |
| 파일 로드 후 입력 동기화 | 파일 I/O 기능이 구현되어 있다고 설명 | JSON 로드 후 `stage-w`, `stage-d`, `actor-h`는 갱신하지만 `default-z` 입력창은 갱신하지 않는다. | 코드 수정 필요 |

## 현재 코드에서 확인된 구현 사항

- Vite + Vanilla TypeScript 구조가 맞다.
- `verbatimModuleSyntax: true`가 켜져 있고, 주요 타입 import는 `import type`을 사용한다.
- 단일 전역 상태 `AppState`와 `setState`/`subscribe` 기반 Pub/Sub 구조가 있다.
- `Fixture.shutter_polygon`은 4개 요소 튜플 타입으로 정의되어 있다.
- 조명기 위치/타겟/셔터 드래그가 캔버스에 구현되어 있다.
- `window.mouseup`은 드래그 중일 때만 상태를 갱신하도록 조건이 있다.
- HTML5 Drag & Drop 기반 씬 순서 변경이 구현되어 있고, 드롭 후 기존 활성 씬 ID로 `active_cue_index`를 재추적한다.
- 씬별 배경 이미지 업로드, 위치/크기/투명도 조절 UI가 있다.
- `imageCache` Map을 사용해 배경 이미지를 캐싱한다.
- 오프스크린 캔버스로 썸네일을 생성하고 `setState` 후 현재 씬 썸네일을 갱신한다.

## 가장 안전한 다음 작업

`NEXT_TASKS.md`의 P0 Task 1부터 진행하는 것이 가장 안전하다.

첫 작업은 `src/config/venues.ts`를 새로 만들고, `Sandbox`와 `Humanities` 프리셋 데이터를 순수 데이터로 정의하는 것이다. 기존 UI, 상태, 렌더링과 연결하지 않는 파일이므로 회귀 위험이 가장 낮다.

다만 `Humanities` 프리셋은 실제 측정값과 도면 기준이 필요하므로, 먼저 극장 좌표계와 데이터 형식을 확정하는 것이 좋다.
