// src/cloud/loginStage.ts
// 로그인 화면 왼쪽에 그리는 작은 3D 무대. 앱의 3D 보기(render/view3d.ts)를 불러오지 않고 가벼운 장면을 따로 만든다.
// 스스로 움직이지 않는다: 처음 한 번 그리고, 사용자가 끌 때와 크기가 바뀔 때만 다시 그린다.
// 시안: docs/design/landing-redesign/login-3d.html (P1)
// 색과 화각은 view3d.ts(DARK_BACKGROUND, SKIN_COLOR, 화각 50°)와 venueModel.ts(벽, 객석, 막)를 따른다.

import type { BufferGeometry, Material, WebGLRenderer } from 'three';

type Vec3 = [number, number, number];

/** 조명기: 색, 세기(바닥에서 느끼는 밝기), 위치, 비출 곳, 반각, 헤이즈 속 빔을 보일지 */
const FIXTURES: [color: number, level: number, from: Vec3, to: Vec3, angle: number, beam: boolean][] = [
  [0xfff1dc, 2.6, [0, 7.2, 1.6], [0.4, 0.9, 0.4], 0.17, true],     // 센터 스페셜
  [0xf5b841, 1.7, [-5.2, 7.2, 1.6], [-1.6, 0.9, -0.3], 0.3, true], // 앰버 사이드
  [0xf5b841, 1.4, [5.2, 7.2, 1.6], [2.2, 0.9, 0.2], 0.3, true],
  [0x6aa8ff, 1.6, [0, 7, -3.6], [0, 0.9, 1.4], 0.42, true],        // 블루 백라이트
  [0xd648a0, 0.9, [3.5, 7, -3.4], [-1, 0.9, 0.6], 0.36, true],
  [0x285ac8, 2.2, [0, 1.1, -2.8], [0, 6.5, -4.2], 0.62, false],    // 사이클 그라운드 로
];

/** container 안에 캔버스를 붙이고 무대를 그린다. three는 이때 따로 불러온다 */
export const mountLoginStage = async (container: HTMLElement) => {
  const THREE = await import('three');

  let renderer: WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return; // WebGL이 없으면 어두운 바탕만 남긴다
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0d0f12);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d0f12, 22, 46);
  const std = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  add(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), std(0x16181c), 0, 0, 4);            // 객석 바닥
  add(new THREE.BoxGeometry(12, 0.9, 8), std(0x3a3631, 0.7), 0, 0.45, 0);                         // 무대
  add(new THREE.BoxGeometry(16, 8, 0.2), std(0x4d4d52, 0.95), 0, 4, -4.3, false);                 // 뒷벽
  for (const side of [-1, 1]) for (const z of [-2.6, -0.2, 2.2]) {
    add(new THREE.BoxGeometry(0.08, 7, 1.3), std(0x333337, 1), side * 6.2, 3.5, z);               // 다리막
  }
  add(new THREE.CylinderGeometry(0.04, 0.04, 14, 8).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 }), 0, 7.2, 1.6, false); // 배튼
  // 배우 (키 1.67 m)와 의자
  const costume = std(0x2a3340, 0.8);
  add(new THREE.CylinderGeometry(0.2, 0.24, 1.0, 16), costume, 0.4, 1.4, 0.4);
  add(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 16), costume, 0.4, 2.05, 0.4);
  add(new THREE.SphereGeometry(0.13, 20, 16), std(0xc9a48a, 0.6), 0.4, 2.44, 0.4);
  add(new THREE.BoxGeometry(0.5, 0.45, 0.45), std(0x5a4636, 0.8), -1.6, 1.125, -0.6);
  // 계단식 객석 10열
  const seat = new THREE.BoxGeometry(0.5, 0.45, 0.45), seatMat = std(0x564c4c, 0.9);
  for (let row = 0; row < 10; row++) for (let col = -7; col <= 7; col++) {
    if (col !== 0) add(seat, seatMat, col * 0.58, 0.23 + row * 0.28, 7 + row * 0.95);
  }

  scene.add(new THREE.HemisphereLight(0x8899aa, 0x222222, 0.18 * Math.PI));
  const bodyGeo = new THREE.BoxGeometry(0.28, 0.28, 0.5), bodyMat = std(0x30343a, 0.5);
  for (const [color, level, from, to, angle, showBeam] of FIXTURES) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const length = a.distanceTo(b);
    // 물리 단위 조명: 비추는 곳에서 level만큼 밝도록 거리 제곱을 곱한다
    const light = new THREE.SpotLight(color, level * Math.PI * length * length, 30, angle, 0.55, 2);
    light.position.copy(a);
    light.target.position.copy(b);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
    scene.add(light, light.target);
    add(bodyGeo, bodyMat, ...from, false).lookAt(b);
    if (!showBeam) continue;
    // 헤이즈 속 빔: 끝이 열린 원뿔을 세 겹으로 겹쳐 윤곽을 흐린다
    const dir = b.clone().sub(a).normalize();
    for (const [scale, opacity] of [[1, 0.018], [0.75, 0.022], [0.5, 0.026]]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(Math.tan(angle) * length * scale, length, 40, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      cone.position.copy(a).addScaledVector(dir, length / 2);
      scene.add(cone);
    }
  }

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  const target = new THREE.Vector3(0, 1.6, 0.2);
  const orbit = { th: 0.62, ph: 0.3, r: 14.5 };

  const draw = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.position.set(
      target.x + Math.sin(orbit.th) * Math.cos(orbit.ph) * orbit.r,
      target.y + Math.sin(orbit.ph) * orbit.r,
      target.z + Math.cos(orbit.th) * Math.cos(orbit.ph) * orbit.r);
    camera.lookAt(target);
    renderer.render(scene, camera);
  };
  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(); });
  };

  // 끌어서 돌리기
  const canvas = renderer.domElement;
  let drag: { x: number; y: number; th: number; ph: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, th: orbit.th, ph: orbit.ph };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.th = Math.max(-1.2, Math.min(1.2, drag.th - (e.clientX - drag.x) * 0.005));
    orbit.ph = Math.max(0.04, Math.min(1.2, drag.ph + (e.clientY - drag.y) * 0.004));
    redraw();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  new ResizeObserver(redraw).observe(container);
  redraw();
};
