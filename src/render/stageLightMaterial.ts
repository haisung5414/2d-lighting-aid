// src/render/stageLightMaterial.ts
// 바닥과 사람 모형을 비추는 셰이더. photometrics.ts의 광도 모델을 GPU에서 그대로 계산한다.
//   조도 E = I0 * 10^(-r^p) * cos(입사각) / 거리^2,  셔터는 바닥 투영으로 판정
// 젤 색은 선형 RGB에서 더한다. 그림자를 켠 조명(최대 MAX_SHADOWS개)은 그림자 맵으로 가림을 판정한다.
// 좌표: three.js 월드 좌표 (x, 높이, 앱 y)

import * as THREE from 'three';
import { MAX_SHADOW_FIXTURES, dimmerOutput, getBeamFrame, getPhotometry, shutterPolygon } from '../engine/photometrics';
import { lightColorOf } from '../engine/gels';
import type { Fixture, LampKey, Position3D } from '../types';

export const MAX_FIXTURES = 128;
export const MAX_SHADOWS = MAX_SHADOW_FIXTURES;
const TEXELS_PER_FIXTURE = 8;

/** 모든 조명 재질이 함께 쓰는 그림자 유니폼 */
export interface ShadowUniforms {
  uShadowMap0: THREE.IUniform<THREE.Texture | null>;
  uShadowMap1: THREE.IUniform<THREE.Texture | null>;
  uShadowMap2: THREE.IUniform<THREE.Texture | null>;
  uShadowMap3: THREE.IUniform<THREE.Texture | null>;
  uShadowMatrix: THREE.IUniform<THREE.Matrix4[]>;
  uShadowNearFar: THREE.IUniform<THREE.Vector2[]>;
}

/**
 * 조도(lux)를 화면 밝기로 바꾸는 노출 값. 반사율 0.5인 면에 약 1,000 lux가 닿으면
 * 톤 매핑 전 밝기가 0.7 정도가 되도록 맞췄다.
 */
const EXPOSURE = 0.0045;
/** 반사광을 대신하는 약한 기본광 lux. 조명이 닿지 않는 바닥 도면도 알아볼 수 있을 정도로 둔다 */
const AMBIENT_LUX = 60;
/** 작업등을 켰을 때 위에서 고르게 내려오는 빛 lux. 무대 조명보다 확실히 약하게 둔다 */
export const WORK_LIGHT_LUX = 180;

const toThree = (p: Position3D) => [p.x, p.z, p.y] as const;

export class FixtureDataTexture {
  readonly texture: THREE.DataTexture;
  count = 0;
  /** 작업등 조도 lux (꺼져 있으면 0). 모든 조명 재질이 같은 유니폼을 공유한다 */
  readonly workLight: THREE.IUniform<number> = { value: 0 };
  readonly shadowUniforms: ShadowUniforms = {
    uShadowMap0: { value: null },
    uShadowMap1: { value: null },
    uShadowMap2: { value: null },
    uShadowMap3: { value: null },
    uShadowMatrix: { value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Matrix4()) },
    uShadowNearFar: { value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector2(0.1, 40)) }
  };
  private readonly data: Float32Array<ArrayBuffer>;

  constructor() {
    this.data = new Float32Array(TEXELS_PER_FIXTURE * MAX_FIXTURES * 4);
    this.texture = new THREE.DataTexture(this.data, TEXELS_PER_FIXTURE, MAX_FIXTURES, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
  }

  /** shadowSlots: 그림자를 켠 조명 id -> 그림자 맵 번호 */
  update(fixtures: Fixture[], lamp: LampKey, shadowSlots: Map<string, number> = new Map()) {
    this.data.fill(0);
    this.count = Math.min(MAX_FIXTURES, fixtures.length);

    for (let i = 0; i < this.count; i++) {
      const fix = fixtures[i];
      const phot = getPhotometry(fix, lamp);
      const frame = getBeamFrame(fix);
      const polygon = shutterPolygon(fix);
      const base = i * TEXELS_PER_FIXTURE * 4;
      const write = (texel: number, values: readonly number[]) => {
        values.forEach((v, k) => { this.data[base + texel * 4 + k] = v; });
      };

      write(0, [...toThree(frame.origin), phot.candela * dimmerOutput(fix)]);
      write(1, [...toThree(frame.dir), phot.exponent]);
      write(2, [...toThree(frame.axisA), phot.fieldA * Math.PI / 180]);
      write(3, [...toThree(frame.axisB), phot.fieldB * Math.PI / 180]);
      if (polygon) {
        // 바닥 평면 좌표는 three.js의 (x, z) = 앱의 (x, y)
        write(4, [1, polygon[0].x, polygon[0].y, 0]);
        write(5, [polygon[1].x, polygon[1].y, polygon[2].x, polygon[2].y]);
        write(6, [polygon[3].x, polygon[3].y, 0, 0]);
      }
      // 젤 색(휘도 1 기준 선형 RGB) x 투과율
      const color = lightColorOf(fix.gel);
      // w: 그림자 맵 번호 + 1 (0이면 그림자 없음)
      const slot = shadowSlots.get(fix.id);
      write(7, [...color.rgb.map(c => c * color.transmission), slot === undefined ? 0 : slot + 1]);
    }

    this.texture.needsUpdate = true;
  }
}

const vertexShader = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  #define MAX_FIXTURES ${MAX_FIXTURES}
  uniform sampler2D uFixtures;
  uniform int uCount;
  uniform sampler2D uAlbedoMap;
  uniform bool uUseMap;
  uniform vec3 uAlbedo;
  uniform float uExposure;
  uniform float uAmbient;
  uniform float uWorkLight;
  uniform sampler2D uShadowMap0;
  uniform sampler2D uShadowMap1;
  uniform sampler2D uShadowMap2;
  uniform sampler2D uShadowMap3;
  uniform mat4 uShadowMatrix[${MAX_SHADOWS}];
  uniform vec2 uShadowNearFar[${MAX_SHADOWS}];
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  vec4 fixtureTexel(int i, int k) {
    return texelFetch(uFixtures, ivec2(k, i), 0);
  }

  bool insideQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
    vec2 v[4] = vec2[4](a, b, c, d);
    bool inside = false;
    for (int i = 0, j = 3; i < 4; j = i++) {
      if ((v[i].y > p.y) != (v[j].y > p.y)
        && p.x < (v[j].x - v[i].x) * (p.y - v[i].y) / (v[j].y - v[i].y) + v[i].x) {
        inside = !inside;
      }
    }
    return inside;
  }

  float shadowDepth(int slot, vec2 uv) {
    if (slot == 0) return texture2D(uShadowMap0, uv).r;
    if (slot == 1) return texture2D(uShadowMap1, uv).r;
    if (slot == 2) return texture2D(uShadowMap2, uv).r;
    return texture2D(uShadowMap3, uv).r;
  }

  /** 1 = 빛이 닿음, 0 = 가려짐. 3x3 PCF로 경계를 살짝 부드럽게 한다 */
  float shadowFactor(int slot) {
    vec4 lp = uShadowMatrix[slot] * vec4(vWorldPos, 1.0);
    if (lp.w <= 0.0) return 1.0;
    vec3 ndc = lp.xyz / lp.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
    float n = uShadowNearFar[slot].x;
    float f = uShadowNearFar[slot].y;
    // 원근 투영의 w는 조명에서 잰 거리(뷰 공간 깊이)와 같다
    float fragDepth = lp.w;
    float bias = 0.04 + 0.004 * fragDepth;
    float lit = 0.0;
    vec2 texel = vec2(1.0 / 1024.0);
    for (int dx = -1; dx <= 1; dx++) {
      for (int dy = -1; dy <= 1; dy++) {
        float d = shadowDepth(slot, uv + vec2(float(dx), float(dy)) * texel);
        float zNdc = d * 2.0 - 1.0;
        float occluder = 2.0 * n * f / (f + n - zNdc * (f - n));
        lit += fragDepth - bias > occluder ? 0.0 : 1.0;
      }
    }
    return lit / 9.0;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    // 작업등: 천장에서 고르게 내려오는 흰 빛. 위를 향한 면이 더 밝고 옆면은 조금 어둡다
    vec3 E = vec3(uAmbient + uWorkLight * (0.55 + 0.45 * max(N.y, 0.0)));

    for (int i = 0; i < MAX_FIXTURES; i++) {
      if (i >= uCount) break;
      vec4 t0 = fixtureTexel(i, 0);
      vec4 t1 = fixtureTexel(i, 1);
      vec4 t2 = fixtureTexel(i, 2);
      vec4 t3 = fixtureTexel(i, 3);
      vec3 F = t0.xyz;

      vec3 toP = vWorldPos - F;
      float dist = max(0.1, length(toP));
      vec3 L = toP / dist;
      float z = dot(L, t1.xyz);
      if (z <= 0.0) continue;

      float cosInc = dot(N, -L);
      if (cosInc <= 0.0) continue;

      vec4 t4 = fixtureTexel(i, 4);
      if (t4.x > 0.5 && vWorldPos.y < F.y - 0.001) {
        vec4 t5 = fixtureTexel(i, 5);
        vec4 t6 = fixtureTexel(i, 6);
        float s = F.y / (F.y - vWorldPos.y);
        vec2 hit = F.xz + (vWorldPos.xz - F.xz) * s;
        if (!insideQuad(hit, t4.yz, t5.xy, t5.zw, t6.xy)) continue;
      }

      float ta = atan(dot(L, t2.xyz), z) / t2.w;
      float tb = atan(dot(L, t3.xyz), z) / t3.w;
      float r = length(vec2(ta, tb));
      float rel = pow(10.0, -pow(r, t1.w));
      vec4 t7 = fixtureTexel(i, 7);
      float lit = 1.0;
      if (t7.w > 0.5) {
        lit = shadowFactor(int(t7.w + 0.5) - 1);
        if (lit <= 0.0) continue;
      }
      E += t7.rgb * (t0.w * rel * cosInc * lit / (dist * dist));
    }

    vec3 albedo = uUseMap ? texture2D(uAlbedoMap, vUv).rgb : uAlbedo;
    // 완전 확산면의 휘도 = 반사율 * E / pi
    gl_FragColor = vec4(albedo * E / 3.14159265 * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const createStageLightMaterial = (
  fixtures: FixtureDataTexture,
  options: { map?: THREE.Texture; color?: THREE.ColorRepresentation }
): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  uniforms: {
    uFixtures: { value: fixtures.texture },
    uCount: { value: fixtures.count },
    uAlbedoMap: { value: options.map ?? null },
    uUseMap: { value: Boolean(options.map) },
    uAlbedo: { value: new THREE.Color(options.color ?? 0xffffff) },
    uExposure: { value: EXPOSURE },
    uAmbient: { value: AMBIENT_LUX },
    uWorkLight: fixtures.workLight,
    ...fixtures.shadowUniforms
  },
  vertexShader,
  fragmentShader
});
