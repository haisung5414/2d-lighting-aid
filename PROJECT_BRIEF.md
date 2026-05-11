# PROJECT BRIEF: Web-based 2D Stage Lighting Simulator

## 1. 프로젝트 개요 (Project Overview)
본 프로젝트는 연극 동아리 구성원 및 조명 디자이너들이 복잡한 설치 프로그램 없이, 웹 브라우저 상에서 직관적으로 무대 조명을 설계하고 시뮬레이션할 수 있는 2D 평면도(Top-down) 기반의 조명 설계 보조 도구(Lighting Aid)입니다.

* 타겟 사용자: 웹 및 조명 프로그램에 익숙하지 않은 연극 동아리원, 입문자, 조명 디자이너.
* 구동 방식: 서버나 데이터베이스(DB) 연동 없이 100% 클라이언트 사이드(브라우저 내부)에서 구동됩니다. 오프라인에서도 작동하며, 데이터는 .json 파일 형태로 로컬에 저장하고 불러옵니다.
* 핵심 가치: 3D 공간상의 조명 투사 물리 법칙을 수학적으로 정확히 연산하되, 사용자에게는 조작이 간편한 2D UI/UX를 제공하는 것입니다.

---

## 2. 기술 스택 (Tech Stack)
초보자도 유지보수하기 쉽도록 복잡한 프레임워크(React, Vue 등)를 배제하고 순수 표준 기술을 사용했습니다.

* 빌드 도구: Vite (빠른 로컬 개발 및 간편한 GitHub Pages 배포 지원)
* 언어: Vanilla TypeScript (엄격한 타입 정의로 런타임 에러 및 데이터 오염 방지)
* 그래픽 엔진: HTML5 Canvas API (2D Context)
* 스타일링: CSS3 (Flexbox 기반 레이아웃)

---

## 3. 핵심 아키텍처 및 설계 원칙 (Core Architecture)

나중에 코드를 수정할 AI 세션은 다음 3가지 핵심 설계 원칙을 반드시 숙지해야 합니다.

### 1) 단일 진실 공급원 (Single Source of Truth)
모든 데이터(무대 크기, 씬 목록, 조명기 설정 등)는 AppState라는 단 하나의 전역 상태 객체로 관리됩니다. 화면(DOM)에서 데이터를 직접 읽어오지 않으며, 오직 AppState만이 현재 상태를 대변합니다.

### 2) 발행/구독 (Pub/Sub) 기반 상태 업데이트
프레임워크가 없으므로 상태 변경과 화면 갱신을 일치시키기 위해 간단한 Pub/Sub 패턴을 사용합니다.
* 상태를 변경할 때는 반드시 setState(draft => { ... }) 콜백 함수를 호출해야 합니다.
* setState가 실행되면 내부적으로 notify()가 호출되어 등록된 렌더링 함수(renderCanvas, renderSceneList, renderFixtureUI)들이 자동으로 화면을 다시 그립니다.

### 3) 불변성 및 깊은 복사 (Deep Copy)
객체 참조(Reference)로 인한 데이터 오염을 막기 위해 씬 복사나 Undo/Redo 스냅샷 저장 시 JSON.parse(JSON.stringify())를 통한 깊은 복사를 원칙으로 합니다.

---

## 4. 디렉토리 및 파일 구조 (File Structure)

```text
2d-lighting-aid/
├── index.html              # 앱 진입점 HTML (전체 레이아웃 및 패널 틀 정의)
├── tsconfig.json           # TypeScript 설정 (verbatimModuleSyntax 켜짐)
└── src/
    ├── main.ts             # 메인 엔트리 포인트 (초기화, 모듈 결합, 단축키 등록)
    ├── style.css           # 전역 스타일
    ├── types/
    │   └── index.ts        # [핵심] 모든 타입 및 인터페이스 정의 (AppState, Cue, Fixture 등)
    ├── state/
    │   └── store.ts        # 전역 상태(state), Pub/Sub, Undo/Redo 히스토리 스택 관리
    ├── engine/
    │   └── geometry.ts     # 3D 원뿔 투사 -> 2D 타원 변환 및 렌즈 제원 수학 연산 엔진
    ├── render/
    │   └── canvas.ts       # Canvas 다중 레이어 그리기, 오프스크린 썸네일 생성, 마우스 드래그 이벤트
    └── ui/
        ├── manager.ts      # 전역 뷰 옵션 토글 및 파일 I/O (JSON Save/Load)
        ├── scene.ts        # 좌측 씬(Cue) 리스트 렌더링 및 Drag & Drop 순서 변경
        └── fixture.ts      # 우측 조명 목록 및 속성 패널 제어
```

---

## 5. 현재 구현된 핵심 기능 (Current Implemented Features)

현재 코드는 마이그레이션 및 고도화 단계를 거쳐 아래 기능들이 작동하는 상태입니다.

### 캔버스 및 광학 엔진 (geometry.ts, canvas.ts)
* 물리 기반 렌더링: 조명기 높이(z)와 타겟 좌표를 바탕으로 중심광(Beam)과 주변광(Field)의 타원을 바닥(z=0)과 배우 얼굴 높이(z=Actor)에 정확히 분리 투사.
* 4-Point 셔터 마스킹: 조명기 셔터 핸들을 조작하여 임의의 사각형 마스킹(클리핑) 생성 및 역투영 연산.
* 씬별 배경 도면 로드: 씬마다 개별적인 도면 이미지(PNG/JPG)를 업로드하여 Base64로 변환 후 무대 바닥에 렌더링 (투명도 조절 가능).

### 씬 매니저 (scene.ts)
* HTML5 Drag & Drop: 마우스로 씬을 잡아끌어 직관적으로 재생 순서 변경 (순서 변경 시 포커스 추적 보정 완료).
* 실시간 썸네일 생성: 오프스크린 캔버스(Off-screen Canvas)를 활용해 조명을 드래그할 때마다 좌측 목록에 해당 씬의 160x160 미리보기 썸네일을 실시간 갱신.

### 조명기 매니저 (fixture.ts & index.html)
* 고정형 속성 패널: 조명 개수가 늘어나도 X/Y/Z 좌표, 렌즈 선택(19°~51°), 부드러움(Softness)을 조절하는 패널이 항상 화면 우측 하단에 고정되도록 레이아웃 최적화.
* 간섭 최소화: 복잡한 작업 시 특정 조명을 숨기는 가시성 토글 기능 지원.

### 안전장치 및 부가 기능 (store.ts, main.ts)
* Undo/Redo 시스템: Ctrl+Z (실행 취소) 및 Ctrl+Y / Ctrl+Shift+Z (다시 실행) 완벽 지원. 무의미한 연속 저장을 막기 위해 마우스 조작 시작점에만 스냅샷 기록.
* 레이스 컨디션 방지: 전역 mouseup 이벤트가 패널의 click 이벤트를 파괴하지 않도록 드래그 상태 조건부 업데이트 적용 완료.

---

## 6. 현재 개발 단계 및 향후 목표 (Next Steps)

* 현재 단계: 기초 설계와 모듈화, 핵심 조작 UX(썸네일, D&D, Undo/Redo, 개별 배경 이미지)가 안정적으로 완성된 안정화 단계.
* 추후 구현 예정 (현재 미정 / 작업 전):
  1. 시작 화면(Landing Screen) 도입 및 극장별 기본 도면(Global) + 세트 도면(Local)의 듀얼 레이어 렌더링 구조.
  2. 선택된 조명의 수직각(Tilt)과 평면각(Pan)을 다이어그램과 함께 직관적으로 보여주는 시각화 패널 추가.
  3. 전체 씬을 포괄하는 글로벌 디머 채널 할당(Patching) 시스템 및 슬라이드 오프캔버스 패널 구축.