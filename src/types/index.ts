// src/types/index.ts

export type LensType = '19deg' | '26deg' | '36deg' | '51deg';
export type FixtureType = 'ellipsoidal' | 'zoom' | 'fresnel' | 'par';
export type ZoomRangeType = 'narrow' | 'medium';
export type FresnelFocus = 'narrow' | 'medium' | 'flood';
export type ParLampType = 'VNSP' | 'NSP' | 'MFL' | 'WFL';
export type DragMode = 'position' | 'target' | 'shutter' | 'probe' | 'set' | null;

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

export interface LensSpec {
  beam: number;
  field: number;
}

export type LensDataMap = Record<LensType, LensSpec>;
export type FresnelDataMap = Record<FresnelFocus, LensSpec>;
export type ParDataMap = Record<ParLampType, {
  beamX: number;
  beamY: number;
  fieldX: number;
  fieldY: number;
}>;

export interface BaseFixture {
  id: string;
  label: string;
  channel?: number;
  type: FixtureType;
  position: Position3D;
  target: Position2D;
  is_visible: boolean;
  edge_softness: number;
  /** LEE 젤 번호. 없으면 젤 없는 텅스텐 빛 */
  gel?: string | null;
  /** 디머 값 0~100 %. 없으면 100 */
  level?: number;
  /** 3D에서 이 조명의 그림자를 계산할지 (최대 4개) */
  cast_shadow?: boolean;
}

export interface ShutterFixtureFields {
  shutter_active: boolean;
  shutter_polygon: [ShutterPoint, ShutterPoint, ShutterPoint, ShutterPoint];
}

export interface FixedEllipsoidalFixture extends BaseFixture, ShutterFixtureFields {
  type: 'ellipsoidal';
  lens_type: LensType;
}

export interface ZoomEllipsoidalFixture extends BaseFixture, ShutterFixtureFields {
  type: 'zoom';
  zoom_range: ZoomRangeType;
  zoom_angle: number;
}

export interface FresnelFixture extends BaseFixture {
  type: 'fresnel';
  focus: FresnelFocus;
  focus_level: number;
}

export interface ParFixture extends BaseFixture {
  type: 'par';
  lamp_type: ParLampType;
  rotation_angle: number;
}

export type Fixture = FixedEllipsoidalFixture | ZoomEllipsoidalFixture | FresnelFixture | ParFixture;

export interface BackgroundImage {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
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

export interface Cue {
  cue_id: string;
  label: string;
  fixtures: Fixture[];
  thumbnail?: string;
  background?: BackgroundImage;
}

export type LampKey = 'HPL575_230' | 'HPL750_230';

/** 무대 위 세트 덩어리 (단, 벽, 계단 등). 모든 씬에서 공통으로 쓴다 */
export type SetPieceKind = 'set' | 'wall' | 'deck' | 'apple';

export interface SetPiece {
  id: string;
  label: string;
  /** 만든 도구 (세트 그리기 / 벽 / 덧마루 / 애플박스 바로가기). 모양과 동작은 모두 같은 세트다 */
  kind?: SetPieceKind;
  /** 중심 위치 m */
  x: number;
  y: number;
  /** x 방향 폭, y 방향 깊이, 높이 m */
  width: number;
  depth: number;
  height: number;
  /** 평면 회전 deg */
  rotation: number;
  /** 표면 색 #rrggbb */
  color: string;
}

export interface StageConfig {
  width: number;
  depth: number;
  actor_height: number;
  default_z: number;
  /** 극장에서 쓰는 HPL 램프 규격. 없으면 기본값을 쓴다 */
  lamp?: LampKey;
  /** 공연장 프리셋 키 (3D 극장 모형을 찾는 데 쓴다) */
  venue_key?: string;
  set_pieces?: SetPiece[];
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
  draggedIndex: number;
}

export interface ProbeState {
  x: number;
  y: number;
  is_visible: boolean;
  /** 3D 사람 모형의 의상 색 (#rrggbb) */
  costume_color?: string;
}

export interface AppState {
  stage_config: StageConfig;
  ui_toggles: UIToggles;
  cues: Cue[];
  active_cue_index: number;
  selected_fixture_id: string | null;
  selected_fixture_ids: string[];
  selected_set_id?: string | null;
  interaction: InteractionState;
  probe: ProbeState;
}
