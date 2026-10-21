// src/config/venues.ts

export interface VenueSourceDocument {
  title: string;
  fileName: string;
  note: string;
}

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;

export interface VenueMapConfig {
  /**
   * Browser-usable asset path or data URL.
   * Keep null until the PDF drawing is exported into public assets.
   */
  image: string | null;
  sourceDocument: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  opacity: number;
  defaultVisible: boolean;
  note: string;
}

export interface VenueReferenceLayerConfig {
  id: string;
  label: string;
  image: string;
  blendMode?: GlobalCompositeOperation;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  defaultVisible: boolean;
  note: string;
}

export interface VenueReferenceArea {
  id: string;
  label: string;
  kind: 'stage' | 'audience' | 'catwalk' | 'balcony' | 'control-room' | 'storage' | 'other';
  x: number;
  y: number;
  width: number;
  depth: number;
  z?: number;
  confidence: 'measured' | 'estimated' | 'placeholder';
  note?: string;
}

/** 평면 위의 사각형. 앱 좌표(m) */
export interface PlanRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 평면 위의 점. 앱 좌표(m) [x, y] */
export type PlanPoint = [number, number];

/**
 * 3D 보기용 극장 골격. 좌표는 앱 좌표(m)이고 높이는 공연장 바닥 기준이다.
 * 값은 세부 도면(벡터 PDF)에서 읽었고, 확인되지 않은 값은 note에 적는다.
 */
export interface VenueModel3D {
  /** 공연장 안쪽 벽면과 천장 높이 */
  hall: PlanRect & { height: number };
  /** 캣워크가 없는 극장은 비워 두고 lightingGrid를 쓴다 */
  catwalk?: {
    z: number;
    /** 그레이팅 통로가 덮는 영역 */
    area: PlanRect;
    /** 통로 사이의 개구부 (조명이 걸리는 칸) */
    openings: PlanRect[];
    /** 조명을 거는 파이프. x 방향으로 놓인다 */
    pipes: { y: number; x0: number; x1: number }[];
  };
  /** 조명을 거는 천장 그리드. 파이프 위치를 모를 때 높이와 범위만 면으로 보여 준다 */
  lightingGrid?: { z: number; area: PlanRect };
  galleries: (PlanRect & { z: number })[];
  /**
   * 사각형으로 나타내기 어려운 발코니. outline은 바닥판 둘레, edge는 공연장 쪽 가장자리(난간이 서는 선)다.
   * 아래는 비어 있다 (갤러리처럼 커튼 상자로 채우지 않는다)
   */
  balconies?: { z: number; outline: PlanPoint[]; edge: PlanPoint[] }[];
  /** 벽 안쪽에 붙은 덩어리 (예: 아래층 벽이 위층보다 두꺼운 부분) */
  solids?: (PlanRect & { z0: number; z1: number })[];
  /** 갤러리와 이어지는 조정실 앞 2층 단. 아래는 막혀 있다 */
  platforms: (PlanRect & { z: number })[];
  /** 계단형 객석. y가 커질수록(객석 쪽으로) 높아진다 */
  seating: PlanRect & { rows: number; topHeight: number } | null;
  /** 객석 쪽 벽(y = hall.y1)에 난 조정실 창 */
  windows: { x0: number; x1: number; z0: number; z1: number }[];
  notes: string[];
}

export interface VenuePreset {
  key: string;
  label: string;
  stage: {
    width: number;
    depth: number;
    actorHeight: number;
    defaultFixtureZ: number;
  };
  coordinateSystem: {
    unit: 'meter';
    origin: string;
    xAxis: string;
    yAxis: string;
  };
  venueMap: VenueMapConfig | null;
  referenceLayers: VenueReferenceLayerConfig[];
  referenceAreas: VenueReferenceArea[];
  sourceDocuments: VenueSourceDocument[];
  notes: string[];
  model3d?: VenueModel3D;
}

export const SANDBOX_VENUE: VenuePreset = {
  key: 'sandbox',
  label: 'Sandbox',
  stage: {
    width: 10,
    depth: 10,
    actorHeight: 1.67,
    defaultFixtureZ: 5.67
  },
  coordinateSystem: {
    unit: 'meter',
    origin: '무대 영역 좌상단',
    xAxis: '오른쪽 방향',
    yAxis: '객석 방향 또는 도면 아래쪽 방향'
  },
  venueMap: null,
  referenceLayers: [],
  referenceAreas: [],
  sourceDocuments: [],
  notes: ['도면 없이 빈 작업 공간으로 시작하는 기본 프리셋이다.']
};

export const HUMANITIES_VENUE: VenuePreset = {
  key: 'humanities',
  label: '인문소극장',
  stage: {
    // User-selected working area from the venue floor plan.
    width: 12.0,
    // Horizontal 24,500mm minus 1,800mm unused blank area = 22,700mm.
    depth: 22.7,
    actorHeight: 1.67,
    // From detail drawing levels: CATWALK FL EL +32.24 minus performance floor EL +26.5 = 5.74m.
    // Keep this editable because the actual fixture pipe height may differ from the catwalk floor.
    defaultFixtureZ: 5.74
  },
  coordinateSystem: {
    unit: 'meter',
    origin: '사용자가 선택한 12.0m x 22.7m 평면 도면 영역의 좌상단',
    xAxis: '도면의 오른쪽 방향',
    yAxis: '도면의 아래쪽 방향'
  },
  venueMap: {
    image: assetPath('venues/humanities/humanities_floor_plan.png'),
    sourceDocument: '인문소극장 무대 평면도.pdf',
    x: 0,
    y: 0,
    width: 12.0,
    depth: 22.7,
    opacity: 0.65,
    defaultVisible: true,
    note: 'PDF 평면도를 앱용 이미지로 추출한 뒤 이 레이어에 연결한다. 바텐 위치는 강제 설치 영역이 아니라 사용자가 배경 도면을 보고 판단하는 참고 정보로 둔다.'
  },
  referenceLayers: [
    {
      id: 'humanities-floor-plan',
      label: '인문소극장 평면도',
      image: assetPath('venues/humanities/humanities_floor_plan.png'),
      blendMode: 'multiply',
      x: 0,
      y: 0,
      width: 12.0,
      height: 22.7,
      opacity: 0.85,
      defaultVisible: true,
      note: '전역 기준 평면도. 모든 씬에서 공통으로 켜고 끌 수 있다.'
    },
    {
      id: 'humanities-catwalk',
      label: '인문소극장 캣워크',
      image: assetPath('venues/humanities/humanities_catwalk.png'),
      blendMode: 'multiply',
      x: 0,
      y: 0,
      width: 12.0,
      height: 22.7,
      opacity: 1,
      // 평면도 위에 겹치면 복잡해서 처음에는 끈다 (레이어 패널에서 켤 수 있음)
      defaultVisible: false,
      note: '상부 조명/캣워크 참고 오버레이. 바텐 설치 제한으로 쓰지 않고 시각 참고용으로만 사용한다.'
    }
  ],
  referenceAreas: [
    {
      id: 'stage-main',
      label: '주무대 기준 작업 영역',
      kind: 'stage',
      x: 0,
      y: 0,
      width: 12.0,
      depth: 22.7,
      confidence: 'measured',
      note: '사용자가 앱의 무대 width/depth로 지정한 12,000mm x 22,700mm 영역.'
    },
    {
      id: 'catwalk-general',
      label: '캣워크/상부 조명 참고 영역',
      kind: 'catwalk',
      x: 0,
      y: 0,
      width: 12.0,
      depth: 22.7,
      z: 5.74,
      confidence: 'estimated',
      note: '세부 도면의 CATWALK FL EL +32.24와 공연장 FL EL +26.5 차이를 기준으로 높이만 우선 반영했다. 정확한 바텐별 X/Y는 배경 도면에서 시각적으로 확인하는 방식으로 둔다.'
    },
    {
      id: 'audience-general',
      label: '객석 참고 영역',
      kind: 'audience',
      x: 0,
      y: 0,
      width: 12.0,
      depth: 22.7,
      confidence: 'placeholder',
      note: '현재는 별도 충돌/설치 제한에 쓰지 않는다. 배경 도면 레이어로 확인하는 것이 우선이다.'
    }
  ],
  sourceDocuments: [
    {
      title: '인문소극장 무대 평면도',
      fileName: '인문소극장 무대 평면도.pdf',
      note: '앱 기준 12.0m x 22.7m 전역 배경 도면의 원본 후보.'
    },
    {
      title: '인문소극장 세부 도면',
      fileName: '인문소극장_세부_도면.pdf',
      note: 'CATWALK FL, 공연장 FL, 상부 조명 배치도와 관련 치수 확인용.'
    }
  ],
  // 인문소극장_세부_도면.pdf 1~3쪽(종단면도, 2F/3F 평면도)의 벡터 좌표에서 읽은 값.
  // 도면 Y10 그리드(무대 쪽 벽) = 앱 y 0, 도면 X3 그리드 = 앱 x 0, 도면 1m = 35.245pt.
  model3d: {
    // 공연장 바닥 EL +26.5, 천장(1FL) EL +34.4
    hall: { x0: 0.5, x1: 11.5, y0: 0, y1: 19.85, height: 7.9 },
    catwalk: {
      // CATWALK FL EL +32.24
      z: 5.74,
      area: { x0: 0.5, x1: 11.5, y0: 0.25, y1: 19.8 },
      openings: [
        { x0: 1.1, x1: 10.9, y0: 17.6, y1: 19.8 },
        { x0: 1.1, x1: 10.9, y0: 14.3, y1: 16.9 },
        { x0: 1.1, x1: 10.9, y0: 11.0, y1: 13.6 },
        { x0: 1.1, x1: 10.9, y0: 7.7, y1: 10.3 },
        { x0: 1.1, x1: 10.9, y0: 4.4, y1: 7.0 },
        { x0: 1.1, x1: 10.9, y0: 2.25, y1: 3.7 },
        { x0: 0.5, x1: 11.5, y0: 0.3, y1: 1.55 }
      ],
      pipes: [
        { y: 19.4, x0: 1.48, x1: 10.52 },
        { y: 18.0, x0: 1.48, x1: 10.52 },
        { y: 16.5, x0: 1.48, x1: 10.52 },
        { y: 14.7, x0: 1.48, x1: 10.52 },
        { y: 13.2, x0: 1.48, x1: 10.52 },
        { y: 11.4, x0: 1.48, x1: 10.52 },
        { y: 9.9, x0: 1.48, x1: 10.52 },
        { y: 8.1, x0: 1.48, x1: 10.52 },
        { y: 6.6, x0: 1.48, x1: 10.52 },
        { y: 4.8, x0: 1.48, x1: 10.52 },
        { y: 3.3, x0: 1.48, x1: 10.52 },
        { y: 2.7, x0: 1.48, x1: 10.52 },
        { y: 1.2, x0: 0.5, x1: 11.5 },
        { y: 0.9, x0: 0.5, x1: 11.5 },
        { y: 0.6, x0: 0.5, x1: 11.5 }
      ]
    },
    // 2층 갤러리와 조정실 앞 단: 종단면도의 BFL EL +29.5 (1층 평면도의 "B1FL -400"과 같은 높이)
    galleries: [
      { x0: 0.5, x1: 1.6, y0: 8.0, y1: 16.6, z: 3.0 },
      { x0: 10.4, x1: 11.5, y0: 8.0, y1: 16.6, z: 3.0 }
    ],
    // 조정실 앞 단은 공연장 벽(y 19.85)에서 y 17.45까지다. 그 앞(객석 맨 윗줄까지)은 의자 수납고라서
    // 객석과 단이 바로 이어지도록 y 16.6부터 채운다
    platforms: [{ x0: 0.5, x1: 11.5, y0: 16.6, y1: 19.85, z: 3.0 }],
    // 종단면도에서 잰 접이식 객석: 6단, 맨 윗단 약 2.15m
    seating: { x0: 2.0, x1: 10.0, y0: 11.2, y1: 16.6, rows: 6, topHeight: 2.15 },
    windows: [{ x0: 3.8, x1: 8.1, z0: 4.4, z1: 5.5 }],
    notes: [
      '캣워크 첫 칸(객석 쪽)의 파이프 y 19.4는 칸 폭으로 추정한 값이다.',
      '객석 단 높이(맨 윗단 2.15m)와 조정실 창 높이는 종단면도의 선 위치에서 잰 값이다.',
      '갤러리 높이는 종단면도에 직접 나오지 않아, 이어지는 조정실 앞 단(EL +29.5)과 같다고 보았다.',
      '천장 보, 벽의 문, 계단 등은 생략했다.'
    ]
  },
  notes: [
    '바텐 위치는 정확한 설치 가능 영역으로 모델링하지 않는다.',
    '전역 배경 도면을 켜고 끄며 사용자가 실제 바텐/캣워크 위치를 시각적으로 확인하는 방식을 우선한다.',
    '조명 설치 위치는 현실의 임시 설치, 이동 설치, 도면 오차를 고려해 앱에서 자유롭게 배치 가능하게 둔다.',
    '도면 이미지가 public asset으로 추출되면 venueMap.image에 경로를 연결한다.'
  ]
};

/** 타원 호의 점들: (cx + ax·cos t, cy + by·sin t), t는 a0→a1 (도) */
const ellipseArc = (cx: number, cy: number, ax: number, by: number, a0: number, a1: number, steps = 8): PlanPoint[] => (
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = (a0 + (a1 - a0) * i / steps) * Math.PI / 180;
    return [Math.round((cx + ax * Math.cos(t)) * 1000) / 1000, Math.round((cy + by * Math.sin(t)) * 1000) / 1000] as PlanPoint;
  })
);

// 두레문예관 치수 (앱 좌표 m). 원점 = 지하 공연장 무대 쪽 벽과 왼쪽 벽의 안쪽 면.
// 평면 치수는 B1 평면도 사진에서 6 m 구조 그리드(가로 18 m, 세로 24 m)를 기준으로 잰 값이고,
// 발코니는 1층 평면도의 "극장상부"에서 잰 값이다 (축척 약 16 px/m, 오차 ±0.15 m 정도).
const DURE = {
  width: 16.4,
  depth: 23.1,
  /** 1층(발코니 층) 벽 안쪽 면: 지하 벽보다 양옆으로 0.35 m 바깥에 있다 */
  upperX0: -0.35,
  upperX1: 16.75,
  /** 영사실 앞 벽 = 객석 맨 뒷줄 끝. 그 뒤(뒤 통로·출입부)는 영사실과 로비 아래다 */
  backWall: 18.0,
  /** 뚫린 공간(난간 선) */
  voidX0: 0.8,
  voidX1: 15.6,
  voidY0: 1.1,
  /** 무대 쪽 두 모서리의 곡면: 가로 2.3 m, 세로 0.95 m */
  cornerX: 2.3,
  cornerY: 0.95,
  /** 발코니 바닥 높이: 사진에서 2440 합판 높이와 거의 같다 */
  balconyZ: 2.5
};

const dureBalconyEdge = (): PlanPoint[] => {
  const { voidX0, voidX1, voidY0, cornerX, cornerY, backWall } = DURE;
  return [
    [voidX0, backWall],
    // 왼쪽 모서리: 옆 가장자리에서 시작해 무대 쪽 가장자리로 둥글게 이어진다
    ...ellipseArc(voidX0 + cornerX, voidY0 + cornerY, cornerX, cornerY, 180, 270),
    ...ellipseArc(voidX1 - cornerX, voidY0 + cornerY, cornerX, cornerY, 270, 360),
    [voidX1, backWall]
  ];
};

export const DURE_VENUE: VenuePreset = {
  key: 'dure',
  label: '두레문예관',
  stage: {
    width: DURE.width,
    depth: DURE.depth,
    actorHeight: 1.67,
    // 천장 조명 그리드 높이 (사용자가 알려 준 값)
    defaultFixtureZ: 7.2
  },
  coordinateSystem: {
    unit: 'meter',
    origin: '지하 공연장 무대 쪽 벽과 왼쪽 벽의 안쪽 면이 만나는 점',
    xAxis: '도면의 오른쪽 방향',
    yAxis: '객석 방향 (도면의 아래쪽)'
  },
  venueMap: {
    image: assetPath('venues/dure/dure_floor_plan.png'),
    sourceDocument: '두레문예관 B1 평면도 사진',
    x: -0.4,
    y: -0.4,
    width: 17.21,
    depth: 23.91,
    opacity: 0.65,
    defaultVisible: true,
    note: '평면도 사진에서 치수 표시를 지우고 안쪽 벽 둘레 0.4 m까지 잘라 낸 이미지.'
  },
  referenceLayers: [
    {
      id: 'dure-floor-plan',
      label: '두레문예관 평면도',
      image: assetPath('venues/dure/dure_floor_plan.png'),
      blendMode: 'multiply',
      x: -0.4,
      y: -0.4,
      width: 17.21,
      height: 23.91,
      opacity: 0.85,
      defaultVisible: true,
      note: 'B1 평면도 사진 (치수 표시를 지운 것). 사진이라 선 위치에 ±0.1 m 정도 오차가 있다.'
    }
  ],
  referenceAreas: [
    {
      id: 'stage-main',
      label: '공연장 안쪽 전체',
      kind: 'stage',
      x: 0,
      y: 0,
      width: DURE.width,
      depth: DURE.depth,
      confidence: 'measured',
      note: '안쪽 벽면 기준 16.4 m × 23.1 m (평면도 사진에서 잰 값).'
    },
    {
      id: 'stage-flat',
      label: '앞 평무대',
      kind: 'stage',
      x: 0,
      y: 0,
      width: DURE.width,
      depth: 9.6,
      confidence: 'measured'
    },
    {
      id: 'audience-seating',
      label: '계단 객석 (10열)',
      kind: 'audience',
      x: 1.0,
      y: 9.6,
      width: 14.4,
      depth: 8.4,
      confidence: 'measured'
    },
    {
      id: 'balcony',
      label: '발코니 (무대 쪽과 양옆)',
      kind: 'balcony',
      x: DURE.upperX0,
      y: 0,
      width: DURE.upperX1 - DURE.upperX0,
      depth: DURE.backWall,
      z: DURE.balconyZ,
      confidence: 'estimated',
      note: '폭 약 1.1 m. 높이는 사진의 2440 합판과 비교한 값.'
    }
  ],
  sourceDocuments: [
    {
      title: '두레문예관 B1 평면도 (사진)',
      fileName: '두레문예관_공연장_치수.png',
      note: '공연장 안쪽 16.4 m × 23.1 m, 앞 평무대 9.6 m, 객석 10열 8.5 m, 뒤 통로 5.1 m.'
    },
    {
      title: '두레문예관 1층 공사 계획 평면도 (사진)',
      fileName: '1층 공사 계획 평면도',
      note: '"극장상부": 발코니 폭, 모서리 곡면, 나선계단, 영사실 위치.'
    }
  ],
  model3d: {
    // 천장 높이는 알려진 값이 없어 조명 그리드(7.2 m) 바로 위로 둔다.
    // 발코니 층 위의 벽은 지하 벽보다 바깥에 있으므로 1층 벽 안쪽 면을 공연장 벽으로 쓴다
    hall: { x0: DURE.upperX0, x1: DURE.upperX1, y0: 0, y1: DURE.backWall, height: 8.0 },
    lightingGrid: { z: 7.2, area: { x0: 0, x1: DURE.width, y0: 0, y1: DURE.backWall } },
    galleries: [],
    balconies: [{
      z: DURE.balconyZ,
      edge: dureBalconyEdge(),
      outline: [
        ...dureBalconyEdge(),
        [DURE.upperX1, DURE.backWall],
        [DURE.upperX1, 0],
        [DURE.upperX0, 0],
        [DURE.upperX0, DURE.backWall]
      ]
    }],
    // 발코니 아래의 지하 벽: 위층 벽보다 0.35 m 안쪽에 있다
    solids: [
      { x0: DURE.upperX0, x1: 0, y0: 0, y1: DURE.backWall, z0: 0, z1: DURE.balconyZ - 0.2 },
      { x0: DURE.width, x1: DURE.upperX1, y0: 0, y1: DURE.backWall, z0: 0, z1: DURE.balconyZ - 0.2 }
    ],
    platforms: [],
    // 평면도에서 잰 객석 블록 14.4 m × 8.4 m, 10열. 맨 윗줄 높이는 사진으로 추정
    seating: { x0: 1.0, x1: 15.4, y0: 9.6, y1: DURE.backWall, rows: 10, topHeight: 2.5 },
    // 영사실 창 3개: 객석 쪽 사진에서 비율로 잰 값
    windows: [
      { x0: 3.05, x1: 5.35, z0: 3.9, z1: 4.55 },
      { x0: 7.05, x1: 9.35, z0: 3.9, z1: 4.55 },
      { x0: 11.05, x1: 13.35, z0: 3.9, z1: 4.55 }
    ],
    notes: [
      '평면 치수는 B1 평면도 사진, 발코니는 1층 평면도 사진에서 잰 값이다 (오차 ±0.15 m 정도).',
      '조명 그리드 높이 7.2 m는 사용자가 알려 준 값이다. 파이프 간격은 알 수 없어 면으로만 보여 준다.',
      '발코니 바닥 2.5 m, 천장 8.0 m, 객석 맨 윗줄 2.5 m, 영사실 창 위치는 사진으로 추정한 값이다.',
      '객석 뒤 통로·출입부(y 18.0~23.1)는 영사실과 로비 아래라서 3D에서는 벽 뒤로 남겨 둔다.',
      '캣워크는 없다. 무대 쪽 왼쪽 모서리의 나선계단(발코니 → 조명 그리드)은 3D에서 생략했다.'
    ]
  },
  notes: [
    '세부 도면이 없어 평면도 사진 두 장과 공연장 사진으로 만든 모형이다.',
    '조명은 7.2 m 높이의 천장 그리드 어디에나 걸 수 있다고 보고 위치를 제한하지 않는다.'
  ]
};

export const VENUES = {
  sandbox: SANDBOX_VENUE,
  humanities: HUMANITIES_VENUE,
  dure: DURE_VENUE
} as const;

export type VenueKey = keyof typeof VENUES;
