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
