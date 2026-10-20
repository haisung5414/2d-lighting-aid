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

/**
 * 3D 보기용 극장 골격. 좌표는 앱 좌표(m)이고 높이는 공연장 바닥 기준이다.
 * 값은 세부 도면(벡터 PDF)에서 읽었고, 확인되지 않은 값은 note에 적는다.
 */
export interface VenueModel3D {
  /** 공연장 안쪽 벽면과 천장 높이 */
  hall: PlanRect & { height: number };
  catwalk: {
    z: number;
    /** 그레이팅 통로가 덮는 영역 */
    area: PlanRect;
    /** 통로 사이의 개구부 (조명이 걸리는 칸) */
    openings: PlanRect[];
    /** 조명을 거는 파이프. x 방향으로 놓인다 */
    pipes: { y: number; x0: number; x1: number }[];
  };
  galleries: (PlanRect & { z: number })[];
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
      defaultVisible: true,
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
    // 2층 갤러리 바닥 B1 FL EL +29.9
    galleries: [
      { x0: 0.5, x1: 1.6, y0: 8.0, y1: 16.63, z: 3.4 },
      { x0: 10.4, x1: 11.5, y0: 8.0, y1: 16.63, z: 3.4 }
    ],
    seating: { x0: 2.0, x1: 10.0, y0: 11.2, y1: 16.8, rows: 6, topHeight: 1.8 },
    windows: [{ x0: 3.8, x1: 8.1, z0: 4.2, z1: 5.3 }],
    notes: [
      '캣워크 첫 칸(객석 쪽)의 파이프 y 19.4는 칸 폭으로 추정한 값이다.',
      '객석 단 높이(맨 윗단 1.8m)와 조정실 창 높이는 종단면도를 눈으로 읽은 추정값이다.',
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

export const VENUES = {
  sandbox: SANDBOX_VENUE,
  humanities: HUMANITIES_VENUE
} as const;

export type VenueKey = keyof typeof VENUES;
