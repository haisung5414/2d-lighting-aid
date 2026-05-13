// src/engine/geometry.ts

import type { Fixture, LensDataMap, Position2D } from '../types';

export const LensData: LensDataMap = {
  "19deg": { beam: 7.5, field: 9.5 },
  "26deg": { beam: 9.5, field: 13 },
  "36deg": { beam: 13, field: 18 },
  "51deg": { beam: 18, field: 25.5 }
};

// calculateEllipse의 반환값 타입 정의
export interface EllipseResult {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

export interface FixtureAngles {
  /**
   * Degrees from straight down toward the target point on the floor.
   * 0 means straight down, 90 means horizontal.
   */
  tilt: number;
  /**
   * Degrees on the stage plane. 0 is +X, 90 is +Y.
   */
  pan: number;
}

export class GeometryEngine {
  static toRad(deg: number): number {
    return deg * Math.PI / 180;
  }

  static toDeg(rad: number): number {
    return rad * 180 / Math.PI;
  }

  static calculateAngles(fixture: Fixture): FixtureAngles {
    const { x: x0, y: y0, z: z0 } = fixture.position;
    const { x: targetX, y: targetY } = fixture.target;

    const dx = targetX - x0;
    const dy = targetY - y0;
    const horizontalDistance = Math.hypot(dx, dy);
    const verticalDrop = Math.max(0.0001, z0);

    const rawPan = this.toDeg(Math.atan2(dy, dx));

    return {
      tilt: this.toDeg(Math.atan2(horizontalDistance, verticalDrop)),
      pan: (rawPan + 360) % 360
    };
  }

  static calculateEllipse(fixture: Fixture, targetZ: number, angleType: 'beam' | 'field'): EllipseResult | null {
    const { x: x0, y: y0, z: z0 } = fixture.position;
    const { x: XT, y: YT } = fixture.target;
    
    const dx_target = XT - x0;
    const dy_target = YT - y0;
    const d_floor = Math.sqrt(dx_target * dx_target + dy_target * dy_target);
    
    const pan = Math.atan2(dy_target, dx_target);
    const tilt = Math.atan2(d_floor, z0);
    
    const z_drop = z0 - targetZ;
    if (z_drop <= 0.1) return null; // 빛이 타겟 평면보다 아래 있거나 같으면 렌더링 불가

    const theta = this.toRad(LensData[fixture.lens_type][angleType]);
    const denom = Math.pow(Math.cos(tilt), 2) - Math.pow(Math.sin(theta), 2);
    
    if (denom <= 0) return null; // 타원이 무한대로 퍼지는 경우 (렌더링 불가)

    const r_near = z_drop * Math.tan(tilt - theta);
    const r_far = z_drop * Math.tan(tilt + theta);
    const d_center = (r_near + r_far) / 2;
    
    return {
      cx: x0 + d_center * Math.cos(pan),
      cy: y0 + d_center * Math.sin(pan),
      radiusX: Math.abs(r_far - r_near) / 2,
      radiusY: Math.abs((z_drop * Math.sin(theta)) / Math.sqrt(denom)),
      rotation: pan
    };
  }

  static projectFloorToFace(
    floorX: number, 
    floorY: number, 
    fixtureZ: number, 
    actorH: number, 
    fixtureX: number, 
    fixtureY: number
  ): Position2D {
    // 바닥 좌표를 배우 얼굴 높이 평면으로 역투영
    const k = (fixtureZ - actorH) / Math.max(0.01, fixtureZ);
    return {
      x: fixtureX + (floorX - fixtureX) * k,
      y: fixtureY + (floorY - fixtureY) * k
    };
  }
}
