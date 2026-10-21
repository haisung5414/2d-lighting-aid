// src/render/venueModel.ts
// 극장 골격(벽, 천장, 갤러리, 조정실 앞 단), 객석, 캣워크를 3D로 만든다. 셋은 3D 화면에서 따로 켜고 끈다.
// 벽과 천장은 안쪽을 향한 면만 그려서, 밖에 있는 카메라에서는 가까운 벽이 보이지 않는다(인형의 집 방식).
// 표면은 무대 조명 셰이더로 비추므로 조명이 벽이나 객석에 닿는 모습도 보인다.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VENUES, type PlanPoint, type PlanRect, type VenueModel3D } from '../config/venues';
import { createStageLightMaterial, type FixtureDataTexture } from './stageLightMaterial';
import type { StageConfig } from '../types';

/** 그림자를 만드는 물체가 쓰는 레이어 (Phase D3) */
export const OCCLUDER_LAYER = 1;

// 실제로는 검은 마감이지만, 완전히 검게 두면 빛이 닿은 모습이 거의 보이지 않아 조금 밝게 둔다
const WALL_COLOR = 0x4d4d52;
const SEAT_COLOR = 0x564c4c;
const GALLERY_COLOR = 0x45454a;
/** 갤러리 아래를 가리는 검은 커튼 */
const CURTAIN_COLOR = 0x333337;
/** 발코니 금속 난간: 벽보다 조금 밝은 어두운 회색 */
const RAILING_COLOR = 0x6a6d73;
/** 난간 높이와 가로대 높이 (발코니 바닥 기준, m) */
const RAIL_HEIGHT = 1.0;
const RAIL_BARS = [0.12, 0.42, 0.72];
/** 난간 기둥 간격 (m) */
const POST_SPACING = 1.2;

export const venueModelFor = (stage: StageConfig): VenueModel3D | null => {
  const byKey = stage.venue_key ? VENUES[stage.venue_key as keyof typeof VENUES] : undefined;
  if (byKey) return byKey.model3d ?? null;
  // venue_key가 없던 예전 저장 파일: 참고 도면 레이어 이름으로 극장을 추정한다
  if (stage.reference_layers.some(layer => layer.id.startsWith('humanities'))) {
    return VENUES.humanities.model3d ?? null;
  }
  return null;
};

/** 앱 좌표의 수평 사각형을 three.js 평면으로 만든다 (법선 방향: up=true면 위, 아니면 아래) */
const horizontalPlane = (rect: PlanRect, z: number, up: boolean, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0), material);
  mesh.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
  mesh.position.set((rect.x0 + rect.x1) / 2, z, (rect.y0 + rect.y1) / 2);
  return mesh;
};

/** 수직 벽. 법선은 normal 방향(three.js 좌표) */
const wallPlane = (width: number, height: number, center: THREE.Vector3, normal: THREE.Vector3, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.copy(center);
  mesh.lookAt(center.clone().add(normal));
  return mesh;
};

const box = (rect: PlanRect, z0: number, z1: number, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(rect.x1 - rect.x0, z1 - z0, rect.y1 - rect.y0), material);
  mesh.position.set((rect.x0 + rect.x1) / 2, (z0 + z1) / 2, (rect.y0 + rect.y1) / 2);
  return mesh;
};

/** 앱 좌표 다각형을 z0~z1 높이의 기둥 모양으로 만든다 */
const prism = (points: PlanPoint[], z0: number, z1: number, material: THREE.Material): THREE.Mesh => {
  // Shape 좌표 (x, -y)를 x축 기준 -90도 회전하면 three.js (x, 0, y)가 되고, 돌출 방향은 위쪽이 된다
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, -y)));
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = z0;
  return mesh;
};

/**
 * 사진의 금속 난간: 손잡이(윗대), 가로대 세 줄, 일정 간격의 기둥.
 * 막대가 많아서 하나의 형상으로 합쳐 한 번에 그린다
 */
const railingGeometry = (edge: PlanPoint[], z: number): THREE.BufferGeometry | null => {
  const parts: THREE.BufferGeometry[] = [];
  /** 두 점 사이에 놓인 가로 막대 (단면 size × size) */
  const bar = (a: PlanPoint, b: PlanPoint, height: number, size: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    // 이웃 막대와 이음매가 벌어지지 않도록 단면 크기만큼 길게 둔다
    const geometry = new THREE.BoxGeometry(Math.hypot(dx, dy) + size, size, size);
    geometry.rotateY(Math.atan2(-dy, dx));
    geometry.translate((a[0] + b[0]) / 2, height, (a[1] + b[1]) / 2);
    parts.push(geometry);
  };
  const post = ([x, y]: PlanPoint) => {
    const geometry = new THREE.BoxGeometry(0.04, RAIL_HEIGHT, 0.04);
    geometry.translate(x, z + RAIL_HEIGHT / 2, y);
    parts.push(geometry);
  };

  let sinceLastPost = POST_SPACING;
  edge.forEach((point, i) => {
    if (i === 0) { post(point); sinceLastPost = 0; return; }
    const prev = edge[i - 1];
    bar(prev, point, z + RAIL_HEIGHT - 0.025, 0.05);
    RAIL_BARS.forEach(h => bar(prev, point, z + h, 0.025));
    // 기둥: 선을 따라 POST_SPACING마다
    const length = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    let at = POST_SPACING - sinceLastPost;
    while (at <= length) {
      const t = at / length;
      post([prev[0] + (point[0] - prev[0]) * t, prev[1] + (point[1] - prev[1]) * t]);
      at += POST_SPACING;
    }
    sinceLastPost = length - (at - POST_SPACING);
  });
  post(edge[edge.length - 1]);
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return merged;
};

/** 파이프 위치를 모르는 천장 조명 그리드: 높이와 범위만 반투명한 면과 테두리로 보여 준다 */
const buildLightingGrid = (grid: NonNullable<VenueModel3D['lightingGrid']>): THREE.Object3D => {
  const group = new THREE.Group();
  const plane = horizontalPlane(grid.area, grid.z, false, new THREE.MeshBasicMaterial({
    color: 0x5a6068, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false
  }));
  plane.renderOrder = 1;
  group.add(plane);
  const { x0, x1, y0, y1 } = grid.area;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const edge = corners.flatMap(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4];
    return [new THREE.Vector3(x, grid.z, y), new THREE.Vector3(nx, grid.z, ny)];
  });
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edge),
    new THREE.LineBasicMaterial({ color: 0x8a96a3, transparent: true, opacity: 0.7 })
  ));
  return group;
};

/** 캣워크와 조명 파이프. 캣워크가 없는 극장은 천장 조명 그리드만 보여 준다 */
export const buildCatwalk = (model: VenueModel3D): THREE.Object3D => {
  const group = new THREE.Group();
  if (model.lightingGrid) group.add(buildLightingGrid(model.lightingGrid));
  if (!model.catwalk) return group;
  const { area, openings, z, pipes } = model.catwalk;

  // 그레이팅 바닥: 개구부를 구멍으로 뚫은 판. 아래가 비쳐 보이도록 반투명하게 둔다.
  // Shape 좌표 (x, -y)를 x축 기준 -90도 회전하면 three.js (x, 0, y)가 된다.
  const shape = new THREE.Shape();
  shape.moveTo(area.x0, -area.y0);
  shape.lineTo(area.x1, -area.y0);
  shape.lineTo(area.x1, -area.y1);
  shape.lineTo(area.x0, -area.y1);
  shape.closePath();
  openings.forEach(o => {
    const hole = new THREE.Path();
    hole.moveTo(o.x0, -o.y0);
    hole.lineTo(o.x0, -o.y1);
    hole.lineTo(o.x1, -o.y1);
    hole.lineTo(o.x1, -o.y0);
    hole.closePath();
    shape.holes.push(hole);
  });
  const grating = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: 0x5a6068, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 })
  );
  grating.rotation.x = -Math.PI / 2;
  grating.position.y = z;
  grating.renderOrder = 1;
  group.add(grating);

  // 개구부 테두리 선: 반투명한 판만으로는 칸이 잘 안 보여서 선을 더한다
  const edgePoints: THREE.Vector3[] = [];
  openings.forEach(o => {
    const corners = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]];
    corners.forEach(([x, y], i) => {
      const [nx, ny] = corners[(i + 1) % 4];
      edgePoints.push(new THREE.Vector3(x, z, y), new THREE.Vector3(nx, z, ny));
    });
  });
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edgePoints),
    new THREE.LineBasicMaterial({ color: 0x8a96a3, transparent: true, opacity: 0.6 })
  ));

  // 조명 파이프 (지름 48mm)
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
  pipes.forEach(pipe => {
    const length = pipe.x1 - pipe.x0;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, length, 8), pipeMaterial);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set((pipe.x0 + pipe.x1) / 2, z - 0.1, pipe.y);
    group.add(mesh);
  });

  return group;
};

export const buildVenueModel = (model: VenueModel3D, data: FixtureDataTexture): THREE.Object3D => {
  const group = new THREE.Group();
  const { hall } = model;
  const wallMaterial = createStageLightMaterial(data, { color: WALL_COLOR });
  const hallW = hall.x1 - hall.x0;
  const hallD = hall.y1 - hall.y0;
  const cx = (hall.x0 + hall.x1) / 2;
  const cy = (hall.y0 + hall.y1) / 2;
  const midZ = hall.height / 2;

  // 벽 4면과 천장: 모두 공연장 안쪽을 향한다
  group.add(
    wallPlane(hallD, hall.height, new THREE.Vector3(hall.x0, midZ, cy), new THREE.Vector3(1, 0, 0), wallMaterial),
    wallPlane(hallD, hall.height, new THREE.Vector3(hall.x1, midZ, cy), new THREE.Vector3(-1, 0, 0), wallMaterial),
    wallPlane(hallW, hall.height, new THREE.Vector3(cx, midZ, hall.y0), new THREE.Vector3(0, 0, 1), wallMaterial),
    wallPlane(hallW, hall.height, new THREE.Vector3(cx, midZ, hall.y1), new THREE.Vector3(0, 0, -1), wallMaterial),
    horizontalPlane(hall, hall.height, false, wallMaterial)
  );

  // 검은 벽은 거의 보이지 않으므로 공연장 모서리를 옅은 선으로 그린다
  const hallEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(hallW, hall.height, hallD)),
    new THREE.LineBasicMaterial({ color: 0x55606e, transparent: true, opacity: 0.45 })
  );
  hallEdges.position.set(cx, midZ, cy);
  group.add(hallEdges);

  // 조정실 창: 객석 쪽 벽에서 살짝 안쪽에 둔다
  model.windows.forEach(w => {
    const glass = wallPlane(
      w.x1 - w.x0, w.z1 - w.z0,
      new THREE.Vector3((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, hall.y1 - 0.02),
      new THREE.Vector3(0, 0, -1),
      new THREE.MeshBasicMaterial({ color: 0x1b2a38 })
    );
    group.add(glass);
  });

  // 갤러리: 바닥판과 난간. 실제 극장에서는 갤러리 아래에 커튼이 쳐져 있어 그 공간이 보이지 않으므로
  // 바닥부터 갤러리 바닥판 아래까지를 커튼 상자로 채운다
  const galleryMaterial = createStageLightMaterial(data, { color: GALLERY_COLOR });
  const curtainMaterial = createStageLightMaterial(data, { color: CURTAIN_COLOR });
  model.galleries.forEach(g => {
    const curtain = box(g, 0, g.z - 0.2, curtainMaterial);
    curtain.layers.enable(OCCLUDER_LAYER);
    group.add(curtain);
    const slab = box(g, g.z - 0.2, g.z, galleryMaterial);
    slab.layers.enable(OCCLUDER_LAYER);
    group.add(slab);
    // 공연장 안쪽 가장자리에 높이 1m 난간
    const innerX = g.x0 <= hall.x0 + 0.01 ? g.x1 : g.x0;
    const rail = box({ x0: innerX - 0.03, x1: innerX + 0.03, y0: g.y0, y1: g.y1 }, g.z, g.z + 1.0, galleryMaterial);
    rail.layers.enable(OCCLUDER_LAYER);
    group.add(rail);
  });

  // 조정실 앞 단: 양쪽 갤러리와 같은 높이로 이어진다. 아래(의자 수납고)는 막혀 있으므로 바닥부터 채운다
  model.platforms.forEach(p => {
    const block = box(p, 0, p.z, galleryMaterial);
    block.layers.enable(OCCLUDER_LAYER);
    group.add(block);
  });

  // 다각형 발코니: 두께 0.2 m 바닥판과 공연장 쪽 가장자리의 금속 난간. 아래는 비워 둔다
  const railingMaterial = model.balconies?.length ? createStageLightMaterial(data, { color: RAILING_COLOR }) : null;
  model.balconies?.forEach(b => {
    const slab = prism(b.outline, b.z - 0.2, b.z, galleryMaterial);
    slab.layers.enable(OCCLUDER_LAYER);
    group.add(slab);
    const railing = railingGeometry(b.edge, b.z);
    if (railing && railingMaterial) {
      const mesh = new THREE.Mesh(railing, railingMaterial);
      mesh.layers.enable(OCCLUDER_LAYER);
      group.add(mesh);
    }
    // 같은 색의 벽과 구분되도록 바닥판 가장자리를 옅은 선으로 그린다
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(b.edge.map(([x, y]) => new THREE.Vector3(x, b.z - 0.2, y))),
      new THREE.LineBasicMaterial({ color: 0x55606e, transparent: true, opacity: 0.6 })
    ));
  });

  // 벽에 붙은 덩어리 (위층보다 두꺼운 아래층 벽 등)
  model.solids?.forEach(s => {
    const block = box(s, s.z0, s.z1, wallMaterial);
    block.layers.enable(OCCLUDER_LAYER);
    group.add(block);
  });

  return group;
};

/** 계단형 객석: 단마다 상자를 쌓는다. 맨 윗단 뒤는 조정실 앞 단과 맞닿는다 */
export const buildSeating = (model: VenueModel3D, data: FixtureDataTexture): THREE.Object3D | null => {
  const s = model.seating;
  if (!s) return null;
  const group = new THREE.Group();
  const seatMaterial = createStageLightMaterial(data, { color: SEAT_COLOR });
  const depth = (s.y1 - s.y0) / s.rows;
  for (let i = 0; i < s.rows; i++) {
    const top = s.topHeight * (i + 1) / s.rows;
    const step = box({ x0: s.x0, x1: s.x1, y0: s.y0 + depth * i, y1: s.y0 + depth * (i + 1) }, 0, top, seatMaterial);
    step.layers.enable(OCCLUDER_LAYER);
    group.add(step);
  }
  return group;
};
