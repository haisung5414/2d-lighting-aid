// src/types/index.ts

/** 
 * 엄격한 Union Type 정의
 * 고정된 문자열 값만 허용하여 런타임 에러 방지
 */
export type LensType = '19deg' | '26deg' | '36deg' | '51deg';
export type DragMode = 'position' | 'target' | 'shutter' | null;

/** 
 * 하위 객체 (좌표 및 벡터) 타입 정의
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

export interface ShutterPoint {
  dx: number;
  dy: number;
}

/** 
 * 렌즈 제원 데이터 구조
 */
export interface LensSpec {
  beam: number;
  field: number;
}

export type LensDataMap = Record<LensType, LensSpec>;

/** 
 * 조명기 (Fixture) 모델
 */
export interface Fixture {
  id: string;
  label: string;
  lens_type: LensType;
  position: Position3D;
  target: Position2D;
  shutter_active: boolean;
  is_visible: boolean;
  // 셔터는 항상 4개의 모서리를 가짐 (튜플로 엄격히 제한)
  shutter_polygon: [ShutterPoint, ShutterPoint, ShutterPoint, ShutterPoint];
  edge_softness: number;
}

export interface BackgroundImage {
  dataUrl: string; // Base64 인코딩된 이미지 데이터
  x: number;       // 무대(미터) 기준 X 좌표
  y: number;       // 무대(미터) 기준 Y 좌표
  width: number;   // 무대(미터) 기준 너비
  height: number;  // 무대(미터) 기준 높이
  opacity: number; // 0.0 ~ 1.0 투명도
}

export interface ReferenceLayer {
  id: string;
  label: string;
  image: string;
  blend_mode?: GlobalCompositeOperation;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  is_visible: boolean;
}

/** 
 * 씬 (Scene/Cue) 모델
 */
export interface Cue {
  cue_id: string;
  label: string;
  fixtures: Fixture[];
  thumbnail?: string;
  background?: BackgroundImage;
}

/** 
 * AppState 하위 구성요소 타입 정의
 */
export interface StageConfig {
  width: number;
  depth: number;
  actor_height: number;
  default_z : number;
  reference_layers: ReferenceLayer[];
}

export interface UIToggles {
  show_floor: boolean;
  show_face: boolean;
  show_beam: boolean;
  show_field: boolean;
}

export interface InteractionState {
  dragMode: DragMode;
  draggedIndex: number; // 선택된 셔터 핸들 인덱스 (0~3) 또는 미선택 시 -1
}

/** 
 * 전역 상태 관리 (Single Source of Truth)
 */
export interface AppState {
  stage_config: StageConfig;
  ui_toggles: UIToggles;
  cues: Cue[];
  active_cue_index: number;
  selected_fixture_id: string | null;
  selected_fixture_ids: string[];
  interaction: InteractionState;
}
