// src/render/view3d.ts
// 읽기 전용 3D 보기. 편집은 2D에서 하고, 여기서는 현재 씬 데이터를 3D로 재구성해 보여준다.
// 밝기는 photometrics.ts의 광도 모델을 따른다 (Probe와 같은 계산).
// 좌표 변환: 앱 (x, y, z[높이]) -> three.js (x, z, y)

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_COSTUME_COLOR, getState, getCurrentCue, subscribe, setState, commitHistory } from '../state/store';
import { DEFAULT_LAMP, dimmerOutput, getBeamFrame, getPhotometry, shutterPolygon } from '../engine/photometrics';
import { FixtureDataTexture, WORK_LIGHT_LUX, createStageLightMaterial } from './stageLightMaterial';
import { lightColorOf } from '../engine/gels';
import { OCCLUDER_LAYER, buildCatwalk, buildVenueModel, venueModelFor } from './venueModel';
import { pickShadowFixtures, renderFixtureShadows } from './fixtureShadows';
import type { Fixture, LampKey, Position2D, SetPiece, StageConfig } from '../types';

type Vec3 = { x: number; y: number; z: number };

const MAX_BEAM_LENGTH = 40;
const RAY_SEGMENTS = 64;
const FLOOR_PX_PER_M = 80;

let container: HTMLElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let dynamicGroup: THREE.Group | null = null;
let fixtureData: FixtureDataTexture | null = null;
let isActive = false;
let lastStageKey = '';
let actorObject: THREE.Object3D | null = null;
let isDraggingActor = false;
let pendingDrag: { x: number; y: number } | null = null;
let floorAlbedo: { key: string; texture: THREE.CanvasTexture } | null = null;
let showVenue = true;
let showCatwalk = true;
let workLightOn = false;
let hemisphere: THREE.HemisphereLight | null = null;
const HEMISPHERE_BASE = 0.6;
/** 극장 구조를 보여 줄 때의 바깥 배경과 땅 색. 어두운 극장 안과 구분되도록 밝은 회색으로 둔다 */
const OUTSIDE_BACKGROUND = 0xbcc2c9;
const OUTSIDE_GROUND = 0xa7aeb6;
const OUTSIDE_GRID = 0x939ba4;
const DARK_BACKGROUND = 0x0d0f12;
const SKIN_COLOR = 0xc9a48a;

const imageCache = new Map<string, HTMLImageElement>();

const toThree = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.z, p.y);

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-6, len(a)));

/* ---------- 빔 외곽선 계산 ---------- */

interface ConeOutline {
  apex: Vec3;
  /** 빔이 닿는 지점들. 바닥에 닿으면 z=0, 닿지 않으면 공중의 끝점 */
  points: Vec3[];
  hitsFloor: boolean;
}

/** 필드 각도(중심 밝기의 10%) 경계를 따라 광선을 쏘아 바닥과 만나는 외곽선을 구한다 */
const computeConeOutline = (fix: Fixture, lamp: LampKey): ConeOutline => {
  const phot = getPhotometry(fix, lamp);
  const frame = getBeamFrame(fix);
  const apex = frame.origin;
  const ta = Math.tan(phot.fieldA * Math.PI / 180);
  const tb = Math.tan(phot.fieldB * Math.PI / 180);

  const points: Vec3[] = [];
  let hitsFloor = true;
  for (let i = 0; i < RAY_SEGMENTS; i++) {
    const phi = (i / RAY_SEGMENTS) * Math.PI * 2;
    const dir = norm(add(frame.dir, add(scale(frame.axisA, ta * Math.cos(phi)), scale(frame.axisB, tb * Math.sin(phi)))));
    const t = dir.z < -1e-4 ? -apex.z / dir.z : Infinity;
    if (t <= MAX_BEAM_LENGTH) {
      const p = add(apex, scale(dir, t));
      points.push({ x: p.x, y: p.y, z: 0 });
    } else {
      hitsFloor = false;
      points.push(add(apex, scale(dir, MAX_BEAM_LENGTH)));
    }
  }

  return { apex, points, hitsFloor };
};

const signedArea = (poly: Position2D[]): number => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
};

/** Sutherland-Hodgman. 실제 셔터가 만드는 사각형은 볼록하므로 이 방식으로 충분하다. */
const clipPolygon = (subject: Position2D[], clipper: Position2D[]): Position2D[] => {
  const clip = signedArea(clipper) < 0 ? [...clipper].reverse() : clipper;
  let output = subject;

  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const c1 = clip[i];
    const c2 = clip[(i + 1) % clip.length];
    const inside = (p: Position2D) => (c2.x - c1.x) * (p.y - c1.y) - (c2.y - c1.y) * (p.x - c1.x) >= 0;
    const intersect = (p: Position2D, q: Position2D): Position2D => {
      const a1 = q.y - p.y;
      const b1 = p.x - q.x;
      const c1v = a1 * p.x + b1 * p.y;
      const a2 = c2.y - c1.y;
      const b2 = c1.x - c2.x;
      const c2v = a2 * c1.x + b2 * c1.y;
      const det = a1 * b2 - a2 * b1;
      if (Math.abs(det) < 1e-9) return p;
      return { x: (b2 * c1v - b1 * c2v) / det, y: (a1 * c2v - a2 * c1v) / det };
    };

    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur));
        output.push(cur);
      } else if (inside(prev)) {
        output.push(intersect(prev, cur));
      }
    }
  }

  return output;
};

/** 셔터가 적용된 최종 빔 외곽선 */
const computeShapedOutline = (fix: Fixture, lamp: LampKey): ConeOutline => {
  const outline = computeConeOutline(fix, lamp);
  const shutter = shutterPolygon(fix);
  if (!shutter || !outline.hitsFloor) return outline;

  const clipped = clipPolygon(outline.points.map(p => ({ x: p.x, y: p.y })), shutter);
  return { ...outline, points: clipped.map(p => ({ x: p.x, y: p.y, z: 0 })) };
};

/* ---------- 바닥 재질 (회색 바닥 + 참고 도면) ---------- */

const loadImage = (src: string): HTMLImageElement => {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
    img.onload = () => rebuild();
  }
  return img;
};

/** 바닥 도면 텍스처는 무대 크기나 도면 레이어가 바뀔 때만 다시 만든다 */
const getFloorAlbedo = (stage: StageConfig): THREE.CanvasTexture => {
  const layers = stage.reference_layers
    .filter(layer => layer.is_visible)
    .map(layer => `${layer.image}:${layer.opacity}:${imageCache.get(layer.image)?.complete ? 1 : 0}`)
    .join('|');
  const key = `${stage.width}x${stage.depth}|${layers}`;
  if (floorAlbedo?.key !== key) {
    floorAlbedo?.texture.dispose();
    floorAlbedo = { key, texture: buildFloorAlbedo(stage) };
  }
  return floorAlbedo.texture;
};

const buildFloorAlbedo = (stage: StageConfig): THREE.CanvasTexture => {
  const w = Math.round(stage.width * FLOOR_PX_PER_M);
  const h = Math.round(stage.depth * FLOOR_PX_PER_M);
  const px = (m: number) => m * FLOOR_PX_PER_M;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // 무대 바닥은 반사율이 낮은 어두운 회색으로 둔다
  ctx.fillStyle = '#6e6e6e';
  ctx.fillRect(0, 0, w, h);
  stage.reference_layers.filter(layer => layer.is_visible).forEach(layer => {
    const img = loadImage(layer.image);
    if (!img.complete || img.naturalWidth === 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, layer.opacity) * 0.7;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, px(layer.x), px(layer.y), px(layer.width), px(layer.height));
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/* ---------- 빔 볼륨 메시 ---------- */

const beamMaterial = (strength: number, color: [number, number, number]) => new THREE.ShaderMaterial({
  uniforms: { uStrength: { value: strength }, uColor: { value: new THREE.Vector3(...color) } },
  vertexShader: /* glsl */`
    attribute float along;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vAlong = along;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uStrength;
    uniform vec3 uColor;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      // 정면으로 보이는 면은 옅게, 비스듬한 가장자리는 진하게 보여 원뿔의 부피감을 흉내 낸다
      float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
      float edge = mix(0.55, 1.0, 1.0 - facing);
      float fade = mix(1.0, 0.25, vAlong);
      gl_FragColor = vec4(uColor * uStrength * edge * fade, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});

/** 빛줄기 진하기: 중심 광도에 따라 조금씩 다르게 보이도록 한다 (분위기 표현용) */
const beamStrength = (candela: number, selected: boolean) => {
  const k = Math.min(1.4, Math.max(0.5, Math.sqrt(candela / 60000)));
  return (selected ? 0.13 : 0.07) * k;
};

/** 빛줄기 색: 젤 색의 가장 큰 성분을 1로 맞추고, 진한 젤일수록 조금 어둡게 한다 */
const beamColor = (gelCode: string | null | undefined): [number, number, number] => {
  const { rgb, transmission } = lightColorOf(gelCode);
  const peak = Math.max(1e-6, ...rgb);
  const k = Math.sqrt(transmission) / peak;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
};

const buildBeamMesh = (outline: ConeOutline, strength: number, color: [number, number, number]): THREE.Mesh | null => {
  const n = outline.points.length;
  if (n < 3) return null;

  const positions: number[] = [];
  const along: number[] = [];
  const apex = toThree(outline.apex);
  for (let i = 0; i < n; i++) {
    const p1 = toThree(outline.points[i]);
    const p2 = toThree(outline.points[(i + 1) % n]);
    positions.push(apex.x, apex.y, apex.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    along.push(0, 1, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, beamMaterial(strength, color));
  mesh.renderOrder = 2;
  return mesh;
};

/* ---------- 조명기 / 라벨 / 배우 ---------- */

const makeLabelSprite = (text: string, selected: boolean): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = selected ? 'rgba(47, 111, 237, 0.92)' : 'rgba(20, 24, 30, 0.8)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 120, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 25);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }));
  sprite.scale.set(0.8, 0.3, 1);
  sprite.renderOrder = 5;
  return sprite;
};

const buildFixtureBody = (fix: Fixture, selected: boolean): THREE.Object3D => {
  const group = new THREE.Group();
  const bodyLength = fix.type === 'ellipsoidal' || fix.type === 'zoom' ? 0.55 : 0.35;
  const geometry = new THREE.CylinderGeometry(0.13, 0.17, bodyLength, 16);
  geometry.rotateX(Math.PI / 2); // 원통 축을 +Z(lookAt 방향)로 맞춘다
  geometry.translate(0, 0, -bodyLength / 2);
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: selected ? 0x2f6fed : 0x30343a,
    emissive: selected ? 0x1d3f8a : 0x000000,
    roughness: 0.6,
    metalness: 0.3
  }));

  group.position.copy(toThree(fix.position));
  group.add(body);
  body.lookAt(toThree({ x: fix.target.x, y: fix.target.y, z: 0 }));

  const label = makeLabelSprite(fix.channel ? `${fix.channel}` : fix.label, selected);
  label.position.set(0, 0.45, 0);
  group.add(label);
  return group;
};

const buildActor = (x: number, y: number, height: number, costume: string, data: FixtureDataTexture): THREE.Object3D => {
  const group = new THREE.Group();
  const costumeMaterial = createStageLightMaterial(data, { color: costume });
  const skinMaterial = createStageLightMaterial(data, { color: SKIN_COLOR });
  const headR = 0.12;
  const bodyH = Math.max(0.4, height - headR * 2 - 0.05);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, bodyH - 0.4, 6, 16), costumeMaterial);
  body.position.y = bodyH / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 16), skinMaterial);
  head.position.y = height - headR;
  body.layers.enable(OCCLUDER_LAYER);
  head.layers.enable(OCCLUDER_LAYER);
  group.add(body, head);
  group.position.set(x, 0, y);
  return group;
};

/** 극장 바깥의 땅: 넓은 회색 판과 1m 격자. 조명과 상관없이 같은 색으로 보인다 */
const buildOutsideGround = (stage: StageConfig): THREE.Object3D => {
  const group = new THREE.Group();
  const size = 120;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color: OUTSIDE_GROUND, toneMapped: false })
  );
  ground.rotation.x = -Math.PI / 2;
  // 무대 바닥 도면 판과 겹쳐 깜빡이지 않도록 살짝 아래에 둔다
  ground.position.set(stage.width / 2, -0.02, stage.depth / 2);
  group.add(ground);

  const grid = new THREE.GridHelper(size, size, OUTSIDE_GRID, OUTSIDE_GRID);
  (grid.material as THREE.Material).toneMapped = false;
  grid.position.set(stage.width / 2, -0.01, stage.depth / 2);
  group.add(grid);
  return group;
};

/** 세트 상자. 조명 셰이더로 비추고, 그림자를 만드는 물체로 표시한다 */
const buildSetPiece = (piece: SetPiece, data: FixtureDataTexture): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(piece.width, piece.height, piece.depth),
    createStageLightMaterial(data, { color: piece.color })
  );
  mesh.position.set(piece.x, piece.height / 2, piece.y);
  // 앱의 평면 회전(x→y 방향)은 three.js에서 y축 기준 반대 방향 회전이다
  mesh.rotation.y = -piece.rotation * Math.PI / 180;
  mesh.layers.enable(OCCLUDER_LAYER);
  return mesh;
};

/* ---------- 씬 구성 ---------- */

const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => {
      const withMap = material as THREE.Material & { map?: THREE.Texture | null };
      withMap.map?.dispose();
      material.dispose();
    });
  });
};

const rebuild = () => {
  if (!isActive || !scene || !dynamicGroup || !fixtureData) return;
  const state = getState();
  const cue = getCurrentCue();
  const stage = state.stage_config;
  const lamp = stage.lamp ?? DEFAULT_LAMP;

  scene.remove(dynamicGroup);
  disposeObject(dynamicGroup);
  dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  const fixtures = (cue?.fixtures ?? []).filter(fix => fix.is_visible !== false);
  const selectedIds = new Set([...state.selected_fixture_ids, state.selected_fixture_id ?? '']);
  const shadowSlots = pickShadowFixtures(fixtures.filter(fix => dimmerOutput(fix) > 0));
  fixtureData.update(fixtures, lamp, shadowSlots);

  // 바닥: Probe와 같은 광도 모델로 화면 픽셀마다 조도를 계산한다
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(stage.width, stage.depth),
    createStageLightMaterial(fixtureData, { map: getFloorAlbedo(stage) })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(stage.width / 2, 0, stage.depth / 2);
  dynamicGroup.add(floor);

  const venueModel = venueModelFor(stage);
  // 극장 구조를 보여 줄 때는 바깥을 밝게 해서 어두운 극장 안과 구분한다
  const showOutside = Boolean(venueModel && showVenue);
  renderer?.setClearColor(showOutside ? OUTSIDE_BACKGROUND : DARK_BACKGROUND);
  if (showOutside) dynamicGroup.add(buildOutsideGround(stage));

  if (venueModel) {
    // 극장 골격(벽, 천장, 갤러리, 객석)과 캣워크는 따로 켜고 끈다
    if (showVenue) dynamicGroup.add(buildVenueModel(venueModel, fixtureData));
    if (showCatwalk) dynamicGroup.add(buildCatwalk(venueModel));
  } else {
    // 극장 모형이 없으면 무대 외곽과 기본 조명 높이를 선으로 보여 준다
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(stage.width, stage.default_z, stage.depth)),
      new THREE.LineBasicMaterial({ color: 0x55606e, transparent: true, opacity: 0.5 })
    );
    box.position.set(stage.width / 2, stage.default_z / 2, stage.depth / 2);
    dynamicGroup.add(box);
  }

  (stage.set_pieces ?? []).forEach(piece => dynamicGroup!.add(buildSetPiece(piece, fixtureData!)));

  // 조명기와 빛줄기
  fixtures.forEach(fix => {
    const selected = selectedIds.has(fix.id);
    dynamicGroup!.add(buildFixtureBody(fix, selected));

    const output = dimmerOutput(fix);
    if (output <= 0) return;
    const strength = beamStrength(getPhotometry(fix, lamp).candela, selected) * Math.sqrt(output);
    const beam = buildBeamMesh(computeShapedOutline(fix, lamp), strength, beamColor(fix.gel));
    if (beam) dynamicGroup!.add(beam);
  });

  // 밝기 측정 지점에 배우 모형을 세운다
  actorObject = null;
  if (state.probe?.is_visible) {
    actorObject = buildActor(state.probe.x, state.probe.y, stage.actor_height, state.probe.costume_color ?? DEFAULT_COSTUME_COLOR, fixtureData);
    dynamicGroup.add(actorObject);
  }

  // 그림자를 켠 조명의 깊이 맵을 만든다 (씬이 바뀔 때만 다시 그린다)
  dynamicGroup.updateMatrixWorld(true);
  renderFixtureShadows(renderer!, scene, fixtures, shadowSlots, lamp, fixtureData);

  // 무대 크기가 바뀌었을 때만 카메라를 다시 맞춘다
  const stageKey = `${stage.width}x${stage.depth}x${stage.default_z}`;
  if (stageKey !== lastStageKey) {
    lastStageKey = stageKey;
    resetCamera();
  }

  renderFrame();
};

const renderFrame = () => {
  if (!isActive || !renderer || !scene || !camera) return;
  renderer.render(scene, camera);
};

const resize = () => {
  if (!container || !renderer || !camera) return;
  const { clientWidth: w, clientHeight: h } = container;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderFrame();
};

/** 처음 3D를 열 때의 시점. 객석이 있으면 맨 윗줄 관객의 눈높이, 없으면 객석 쪽 바깥에서 본다 */
const resetCamera = () => {
  if (!camera || !controls) return;
  const stage = getState().stage_config;
  const cx = stage.width / 2;
  const span = Math.max(stage.width, stage.depth);
  const target = new THREE.Vector3(cx, 1, stage.depth / 2);

  const seating = venueModelFor(stage)?.seating;
  if (seating) {
    camera.position.set(cx, seating.topHeight + 1.15, seating.y1 - 0.4);
    target.set(cx, 1.2, seating.y0 / 2);
  } else {
    // 앱의 +y(도면 아래쪽)가 객석 방향이다
    camera.position.set(cx, 3.2, stage.depth + span * 0.35);
  }

  controls.target.copy(target);
  controls.update();
  renderFrame();
};

/** 작업등: 씬을 다시 만들 필요 없이 공유 유니폼과 기본 조명 세기만 바꾼다 */
const applyWorkLight = () => {
  if (fixtureData) fixtureData.workLight.value = workLightOn ? WORK_LIGHT_LUX : 0;
  if (hemisphere) hemisphere.intensity = HEMISPHERE_BASE * (workLightOn ? 2.5 : 1);
  renderFrame();
};

const createOverlay = (host: HTMLElement) => {
  const overlay = document.createElement('div');
  overlay.className = 'view3d-overlay';
  overlay.innerHTML = `
    <div class="view3d-toggles">
      <label class="view3d-toggle"><input type="checkbox" id="view3d-venue" ${showVenue ? 'checked' : ''}> 극장 구조</label>
      <label class="view3d-toggle"><input type="checkbox" id="view3d-catwalk" ${showCatwalk ? 'checked' : ''}> 캣워크</label>
      <label class="view3d-toggle"><input type="checkbox" id="view3d-worklight" ${workLightOn ? 'checked' : ''}> 작업등</label>
    </div>
    <div class="view3d-hint">조명 편집은 2D 화면에서 해 주세요. 사람 모형은 여기서 끌어서 옮길 수 있습니다.<br>드래그: 회전 · 휠: 확대 · 우클릭 드래그: 이동</div>
  `;
  overlay.querySelector<HTMLInputElement>('#view3d-venue')?.addEventListener('change', e => {
    showVenue = (e.target as HTMLInputElement).checked;
    rebuild();
  });
  overlay.querySelector<HTMLInputElement>('#view3d-worklight')?.addEventListener('change', e => {
    workLightOn = (e.target as HTMLInputElement).checked;
    applyWorkLight();
  });
  overlay.querySelector<HTMLInputElement>('#view3d-catwalk')?.addEventListener('change', e => {
    showCatwalk = (e.target as HTMLInputElement).checked;
    rebuild();
  });
  host.appendChild(overlay);
};

/* ---------- 사람 모형 드래그 ---------- */

const raycaster = new THREE.Raycaster();
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const pointerRay = (event: PointerEvent, element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera!);
  return raycaster;
};

const hitsActor = (event: PointerEvent, element: HTMLElement) =>
  Boolean(actorObject && camera && pointerRay(event, element).intersectObject(actorObject, true).length > 0);

const setupActorDrag = (element: HTMLElement) => {
  // OrbitControls보다 먼저 받아야 회전이 시작되지 않는다
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !hitsActor(event, element)) return;
    event.stopImmediatePropagation();
    isDraggingActor = true;
    controls!.enabled = false;
    element.setPointerCapture(event.pointerId);
    element.style.cursor = 'grabbing';
    commitHistory();
  }, { capture: true });

  element.addEventListener('pointermove', event => {
    if (!isDraggingActor) {
      element.style.cursor = hitsActor(event, element) ? 'move' : 'grab';
      return;
    }
    const hit = pointerRay(event, element).ray.intersectPlane(FLOOR_PLANE, new THREE.Vector3());
    if (!hit) return;
    const stage = getState().stage_config;
    // three.js (x, z) = 앱 (x, y)
    const scheduled = pendingDrag !== null;
    pendingDrag = {
      x: Math.min(stage.width, Math.max(0, hit.x)),
      y: Math.min(stage.depth, Math.max(0, hit.z))
    };
    if (!scheduled) {
      requestAnimationFrame(() => {
        const next = pendingDrag;
        pendingDrag = null;
        if (next) setState(s => { s.probe.x = next.x; s.probe.y = next.y; });
      });
    }
  });

  const endDrag = (event: PointerEvent) => {
    if (!isDraggingActor) return;
    isDraggingActor = false;
    controls!.enabled = true;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    element.style.cursor = 'grab';
  };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
};

const init = (host: HTMLElement) => {
  container = document.createElement('div');
  container.id = 'view3d';
  host.appendChild(container);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(DARK_BACKGROUND);
  // 빛이 겹친 곳이 하얗게 잘리지 않고 부드럽게 포화되도록 한다
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  hemisphere = new THREE.HemisphereLight(0x8899aa, 0x222222, HEMISPHERE_BASE);
  scene.add(hemisphere);
  dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);
  fixtureData = new FixtureDataTexture();

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.addEventListener('change', renderFrame);

  setupActorDrag(renderer.domElement);
  createOverlay(container);
  new ResizeObserver(resize).observe(container);
  subscribe(rebuild);
};

export const setView3DActive = (host: HTMLElement, active: boolean) => {
  if (active && !container) init(host);
  isActive = active;
  if (container) container.style.display = active ? 'block' : 'none';
  if (active) {
    resize();
    rebuild();
  }
};
