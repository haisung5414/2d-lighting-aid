// src/render/view3d.ts
// 읽기 전용 3D 보기. 편집은 2D에서 하고, 여기서는 현재 씬 데이터를 3D로 재구성해 보여준다.
// 좌표 변환: 앱 (x, y, z[높이]) -> three.js (x, z, y)

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getState, getCurrentCue, subscribe } from '../state/store';
import { GeometryEngine, ParData } from '../engine/geometry';
import type { Fixture, Position2D, StageConfig } from '../types';

type Vec3 = { x: number; y: number; z: number };
type CameraPreset = 'audience' | 'top' | 'left' | 'right';

const MAX_BEAM_LENGTH = 40;
const RAY_SEGMENTS = 64;
const FLOOR_PX_PER_M = 80;
const LIGHT_COLOR = 'rgba(255, 238, 210, ALPHA)';

let container: HTMLElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let dynamicGroup: THREE.Group | null = null;
let isActive = false;
let lastStageKey = '';

const imageCache = new Map<string, HTMLImageElement>();

const toThree = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.z, p.y);

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-6, len(a)));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

/* ---------- 빔 외곽선 계산 ---------- */

interface ConeOutline {
  apex: Vec3;
  /** 빔이 닿는 지점들. 바닥에 닿으면 z=0, 닿지 않으면 공중의 끝점 */
  points: Vec3[];
  hitsFloor: boolean;
}

const fixtureHalfAngles = (fix: Fixture, kind: 'beam' | 'field'): { a: number; b: number } => {
  if (fix.type === 'par') {
    const par = ParData[fix.lamp_type];
    return kind === 'beam'
      ? { a: par.beamX, b: par.beamY }
      : { a: par.fieldX, b: par.fieldY };
  }
  const spec = GeometryEngine.getFixtureAngleSpec(fix);
  return { a: spec[kind], b: spec[kind] };
};

const computeConeOutline = (fix: Fixture, kind: 'beam' | 'field'): ConeOutline => {
  const apex: Vec3 = { ...fix.position };
  const target: Vec3 = { x: fix.target.x, y: fix.target.y, z: 0 };
  const d = norm(sub(target, apex));

  // 빔 단면의 두 축: A는 pan 방향(바닥에서 길게 늘어나는 축), B는 그와 수직인 수평 축
  let B = cross(d, { x: 0, y: 0, z: 1 });
  if (len(B) < 1e-4) B = { x: 1, y: 0, z: 0 };
  B = norm(B);
  let A = norm(cross(B, d));

  if (fix.type === 'par') {
    const r = GeometryEngine.toRad(fix.rotation_angle);
    const A2 = add(scale(A, Math.cos(r)), scale(B, Math.sin(r)));
    const B2 = add(scale(A, -Math.sin(r)), scale(B, Math.cos(r)));
    A = A2;
    B = B2;
  }

  const { a, b } = fixtureHalfAngles(fix, kind);
  const ta = Math.tan(GeometryEngine.toRad(a));
  const tb = Math.tan(GeometryEngine.toRad(b));

  const points: Vec3[] = [];
  let hitsFloor = true;
  for (let i = 0; i < RAY_SEGMENTS; i++) {
    const phi = (i / RAY_SEGMENTS) * Math.PI * 2;
    const dir = norm(add(d, add(scale(A, ta * Math.cos(phi)), scale(B, tb * Math.sin(phi)))));
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

/** Sutherland-Hodgman. 셔터 4개 날이 만드는 사각형은 일반적으로 볼록하므로 이 방식으로 충분하다. */
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

const shutterPolygonOf = (fix: Fixture): Position2D[] | null => {
  if (!GeometryEngine.fixtureHasShutters(fix) || !fix.shutter_active) return null;
  return fix.shutter_polygon.map(p => ({ x: fix.target.x + p.dx, y: fix.target.y + p.dy }));
};

/** 셔터가 적용된 최종 빔 외곽선 */
const computeShapedOutline = (fix: Fixture, kind: 'beam' | 'field'): ConeOutline => {
  const outline = computeConeOutline(fix, kind);
  const shutter = shutterPolygonOf(fix);
  if (!shutter || !outline.hitsFloor) return outline;

  const clipped = clipPolygon(outline.points.map(p => ({ x: p.x, y: p.y })), shutter);
  return { ...outline, points: clipped.map(p => ({ x: p.x, y: p.y, z: 0 })) };
};

const distanceFactor = (fix: Fixture): number => {
  const dist = Math.hypot(fix.target.x - fix.position.x, fix.target.y - fix.position.y, fix.position.z);
  return Math.min(1.6, Math.pow(5 / Math.max(0.5, dist), 2) * 1.4);
};

/* ---------- 바닥 텍스처 (도면 x 조명) ---------- */

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

const buildFloorTexture = (stage: StageConfig, fixtures: Fixture[]): THREE.CanvasTexture => {
  const w = Math.round(stage.width * FLOOR_PX_PER_M);
  const h = Math.round(stage.depth * FLOOR_PX_PER_M);
  const px = (m: number) => m * FLOOR_PX_PER_M;

  // 1) 바닥 재질: 회색 무대 바닥 + 켜져 있는 참고 도면
  const albedo = document.createElement('canvas');
  albedo.width = w;
  albedo.height = h;
  const actx = albedo.getContext('2d')!;
  actx.fillStyle = '#8a8a8a';
  actx.fillRect(0, 0, w, h);
  stage.reference_layers.filter(layer => layer.is_visible).forEach(layer => {
    const img = loadImage(layer.image);
    if (!img.complete || img.naturalWidth === 0) return;
    actx.save();
    actx.globalAlpha = Math.min(1, layer.opacity) * 0.7;
    actx.globalCompositeOperation = 'multiply';
    actx.drawImage(img, px(layer.x), px(layer.y), px(layer.width), px(layer.height));
    actx.restore();
  });

  // 2) 조명 맵: 어두운 기본광 위에 빔/필드 영역을 더한다 (셔터는 clip으로 적용)
  const light = document.createElement('canvas');
  light.width = w;
  light.height = h;
  const lctx = light.getContext('2d')!;
  lctx.fillStyle = '#262626';
  lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'lighter';

  const fillOutline = (points: Vec3[], alpha: number) => {
    if (points.length < 3) return;
    lctx.beginPath();
    lctx.moveTo(px(points[0].x), px(points[0].y));
    points.slice(1).forEach(p => lctx.lineTo(px(p.x), px(p.y)));
    lctx.closePath();
    lctx.fillStyle = LIGHT_COLOR.replace('ALPHA', alpha.toFixed(3));
    lctx.fill();
  };

  fixtures.forEach(fix => {
    const field = computeConeOutline(fix, 'field');
    const beam = computeConeOutline(fix, 'beam');
    if (!field.hitsFloor) return;

    const k = distanceFactor(fix);
    lctx.save();
    const shutter = shutterPolygonOf(fix);
    if (shutter) {
      lctx.beginPath();
      lctx.moveTo(px(shutter[0].x), px(shutter[0].y));
      shutter.slice(1).forEach(p => lctx.lineTo(px(p.x), px(p.y)));
      lctx.closePath();
      lctx.clip();
    }
    lctx.filter = 'blur(2px)';
    fillOutline(field.points, 0.35 * k);
    if (beam.hitsFloor) fillOutline(beam.points, 0.45 * k);
    lctx.restore();
  });

  // 3) 합성: 바닥 재질 x 조명
  actx.globalCompositeOperation = 'multiply';
  actx.drawImage(light, 0, 0);
  actx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(albedo);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/* ---------- 빔 볼륨 메시 ---------- */

const beamMaterial = (strength: number) => new THREE.ShaderMaterial({
  uniforms: { uStrength: { value: strength } },
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
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      // 정면으로 보이는 면은 옅게, 비스듬한 가장자리는 진하게 보여 원뿔의 부피감을 흉내 낸다
      float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
      float edge = mix(0.55, 1.0, 1.0 - facing);
      float fade = mix(1.0, 0.25, vAlong);
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * uStrength * edge * fade, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});

const buildBeamMesh = (outline: ConeOutline, strength: number): THREE.Mesh | null => {
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
  const mesh = new THREE.Mesh(geometry, beamMaterial(strength));
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
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

  const pos = toThree(fix.position);
  group.position.copy(pos);
  group.add(body);
  body.lookAt(toThree({ x: fix.target.x, y: fix.target.y, z: 0 }));

  const label = makeLabelSprite(fix.channel ? `${fix.channel}` : fix.label, selected);
  label.position.set(0, 0.45, 0);
  group.add(label);
  return group;
};

const buildActor = (x: number, y: number, height: number): THREE.Object3D => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xd9d2c5, roughness: 0.85 });
  const headR = 0.12;
  const bodyH = Math.max(0.4, height - headR * 2 - 0.05);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, bodyH - 0.4, 6, 16), material);
  body.position.y = bodyH / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 16), material);
  head.position.y = height - headR;
  group.add(body, head);
  group.position.set(x, 0, y);
  return group;
};

/** 배우 모형만 비추는 실제 SpotLight. 바닥은 텍스처로 처리하므로 영향을 받지 않는다. */
const buildActorLight = (fix: Fixture): THREE.SpotLight => {
  const spec = GeometryEngine.getFixtureAngleSpec(fix);
  const field = GeometryEngine.toRad(spec.field);
  const beam = GeometryEngine.toRad(spec.beam);
  const light = new THREE.SpotLight(0xffeedd, 60, 0, field, Math.min(1, Math.max(0, 1 - beam / field)), 1.6);
  light.position.copy(toThree(fix.position));
  light.target.position.copy(toThree({ x: fix.target.x, y: fix.target.y, z: 0 }));
  return light;
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
  if (!isActive || !scene || !dynamicGroup) return;
  const state = getState();
  const cue = getCurrentCue();
  const stage = state.stage_config;

  scene.remove(dynamicGroup);
  disposeObject(dynamicGroup);
  dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  const fixtures = (cue?.fixtures ?? []).filter(fix => fix.is_visible !== false);
  const selectedIds = new Set([...state.selected_fixture_ids, state.selected_fixture_id ?? '']);

  // 바닥
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(stage.width, stage.depth),
    new THREE.MeshBasicMaterial({ map: buildFloorTexture(stage, fixtures) })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(stage.width / 2, 0, stage.depth / 2);
  dynamicGroup.add(floor);

  // 무대 외곽과 기본 조명 높이를 보여주는 선
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(stage.width, stage.default_z, stage.depth)),
    new THREE.LineBasicMaterial({ color: 0x55606e, transparent: true, opacity: 0.5 })
  );
  box.position.set(stage.width / 2, stage.default_z / 2, stage.depth / 2);
  dynamicGroup.add(box);

  // 조명기와 빔
  fixtures.forEach(fix => {
    const selected = selectedIds.has(fix.id);
    dynamicGroup!.add(buildFixtureBody(fix, selected));

    const k = distanceFactor(fix);
    const field = buildBeamMesh(computeShapedOutline(fix, 'field'), (selected ? 0.16 : 0.09) * Math.min(1, k + 0.3));
    if (field) dynamicGroup!.add(field);

    const light = buildActorLight(fix);
    dynamicGroup!.add(light, light.target);
  });

  // 밝기 측정 지점에 배우 모형을 세운다
  if (state.probe?.is_visible) {
    dynamicGroup.add(buildActor(state.probe.x, state.probe.y, stage.actor_height));
  }

  // 무대 크기가 바뀌었을 때만 카메라를 다시 맞춘다
  const stageKey = `${stage.width}x${stage.depth}x${stage.default_z}`;
  if (stageKey !== lastStageKey) {
    lastStageKey = stageKey;
    setCameraPreset('audience');
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

export const setCameraPreset = (preset: CameraPreset) => {
  if (!camera || !controls) return;
  const stage = getState().stage_config;
  const cx = stage.width / 2;
  const cz = stage.depth / 2;
  const span = Math.max(stage.width, stage.depth);
  const target = new THREE.Vector3(cx, 1, cz);

  if (preset === 'audience') {
    // 앱의 +y(도면 아래쪽)를 객석 방향으로 본다
    camera.position.set(cx, 3.2, stage.depth + span * 0.35);
  } else if (preset === 'top') {
    camera.position.set(cx, span * 1.25, cz + 0.01);
    target.y = 0;
  } else if (preset === 'left') {
    camera.position.set(-span * 0.6, 4, cz);
  } else {
    camera.position.set(stage.width + span * 0.6, 4, cz);
  }

  controls.target.copy(target);
  controls.update();
  renderFrame();
};

const createOverlay = (host: HTMLElement) => {
  const overlay = document.createElement('div');
  overlay.className = 'view3d-overlay';
  overlay.innerHTML = `
    <div class="view3d-presets">
      <button data-preset="audience">객석에서</button>
      <button data-preset="top">위에서</button>
      <button data-preset="left">왼쪽에서</button>
      <button data-preset="right">오른쪽에서</button>
    </div>
    <div class="view3d-hint">3D 보기는 읽기 전용입니다. 조명 편집은 2D 화면에서 해 주세요.<br>드래그: 회전 · 휠: 확대 · 우클릭 드래그: 이동</div>
  `;
  overlay.querySelectorAll<HTMLButtonElement>('button[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => setCameraPreset(btn.dataset.preset as CameraPreset));
  });
  host.appendChild(overlay);
};

const init = (host: HTMLElement) => {
  container = document.createElement('div');
  container.id = 'view3d';
  host.appendChild(container);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0d0f12);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x8899aa, 0x222222, 0.35));
  dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.addEventListener('change', renderFrame);

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
