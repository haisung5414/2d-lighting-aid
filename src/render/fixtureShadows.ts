// src/render/fixtureShadows.ts
// "그림자 계산"을 켠 조명(최대 4개)마다 조명 위치에서 본 깊이 맵을 만든다.
// 조명 셰이더는 이 깊이 맵과 비교해서 세트, 객석, 사람 모형 등에 가려진 곳을 어둡게 한다.
// 그림자를 만드는 물체는 OCCLUDER_LAYER가 켜진 메시뿐이다(바닥, 벽, 천장은 제외).

import * as THREE from 'three';
import { getBeamFrame, getPhotometry } from '../engine/photometrics';
import { OCCLUDER_LAYER } from './venueModel';
import { MAX_SHADOWS, type FixtureDataTexture } from './stageLightMaterial';
import type { Fixture, LampKey } from '../types';

const SHADOW_MAP_SIZE = 1024;
const NEAR = 0.1;
const FAR = 40;

const targets: THREE.WebGLRenderTarget[] = [];
const cameras: THREE.PerspectiveCamera[] = [];
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.BackSide });

const ensureSlot = (slot: number) => {
  if (targets[slot]) return;
  const target = new THREE.WebGLRenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  target.depthTexture = new THREE.DepthTexture(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  targets[slot] = target;
  const camera = new THREE.PerspectiveCamera(60, 1, NEAR, FAR);
  camera.layers.set(OCCLUDER_LAYER);
  cameras[slot] = camera;
};

/** 그림자를 계산할 조명을 고른다. 켜진 조명 중 앞에서부터 최대 MAX_SHADOWS개 */
export const pickShadowFixtures = (fixtures: Fixture[]): Map<string, number> => {
  const slots = new Map<string, number>();
  fixtures.forEach(fix => {
    if (fix.cast_shadow && slots.size < MAX_SHADOWS) slots.set(fix.id, slots.size);
  });
  return slots;
};

export const renderFixtureShadows = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  fixtures: Fixture[],
  slots: Map<string, number>,
  lamp: LampKey,
  data: FixtureDataTexture
) => {
  const uniforms = data.shadowUniforms;
  const maps = [uniforms.uShadowMap0, uniforms.uShadowMap1, uniforms.uShadowMap2, uniforms.uShadowMap3];
  maps.forEach(map => { map.value = null; });
  if (slots.size === 0) return;

  const previousTarget = renderer.getRenderTarget();
  const previousOverride = scene.overrideMaterial;
  scene.overrideMaterial = depthOnly;

  fixtures.forEach(fix => {
    const slot = slots.get(fix.id);
    if (slot === undefined) return;
    ensureSlot(slot);
    const camera = cameras[slot];
    const phot = getPhotometry(fix, lamp);
    const frame = getBeamFrame(fix);

    // 필드 각도보다 조금 넓게 잡아 빛이 닿는 범위를 모두 덮는다
    const halfAngle = Math.max(phot.fieldA, phot.fieldB) * 1.3;
    camera.fov = Math.min(150, halfAngle * 2);
    camera.near = NEAR;
    camera.far = FAR;
    camera.position.set(frame.origin.x, frame.origin.z, frame.origin.y);
    camera.up.set(0, 1, 0);
    if (Math.abs(frame.dir.z) > 0.99) camera.up.set(0, 0, 1);
    camera.lookAt(frame.origin.x + frame.dir.x, frame.origin.z + frame.dir.z, frame.origin.y + frame.dir.y);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    renderer.setRenderTarget(targets[slot]);
    renderer.clear();
    renderer.render(scene, camera);

    uniforms.uShadowMatrix.value[slot].multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.uShadowNearFar.value[slot].set(NEAR, FAR);
    maps[slot].value = targets[slot].depthTexture;
  });

  scene.overrideMaterial = previousOverride;
  renderer.setRenderTarget(previousTarget);
};
