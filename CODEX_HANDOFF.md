# 🤖 CODEX HANDOFF: 2D Stage Lighting Simulator

> **Codex / AI 세션에게 알림:** > 본 문서는 프로젝트의 빠른 인계(Handoff)를 위한 핵심 요약본이다. 작업을 시작하기 전 아래 내용을 반드시 완벽하게 숙지하고 지시된 작업 규칙을 엄수하라.

---

## 1. 프로젝트 한 줄 설명
서버 불필요, 100% 브라우저 내부(Canvas 2D)에서 구동되며 3D 광학 연산 기반으로 무대 조명을 설계하는 **무설치 웹 기반 2D 평면도 조명 시뮬레이터**이다.

## 2. 기술 스택
* **환경:** Vite + Vanilla TypeScript (배포: GitHub Pages)
* **엔진:** HTML5 Canvas API (2D Context)
* **스타일:** 순수 CSS3 (Flexbox 레이아웃 기반)

## 3. 현재 파일 구조 요약
```text
src/
├── main.ts             # 엔트리 포인트 (초기화, 모듈 결합, 단축키)
├── types/index.ts      # [핵심] 단일 진실 공급원 (모든 타입/인터페이스 정의)
├── state/store.ts      # 전역 상태(state) 관리, Pub/Sub, Undo/Redo 스택
├── engine/geometry.ts  # 3D 투사 -> 2D 타원/마스킹 수학 연산 엔진
├── render/canvas.ts    # 다중 레이어 렌더링, 오프스크린 썸네일, 마우스 이벤트
└── ui/                 # DOM 조작 분리 (manager.ts, scene.ts, fixture.ts)