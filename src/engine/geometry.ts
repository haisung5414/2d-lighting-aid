// src/engine/geometry.ts

import type { Cue, Fixture, LensDataMap, LensSpec, ParDataMap, Position2D, ProbeState, StageConfig, ZoomRangeType } from '../types';
import { DEFAULT_LAMP, FACE_NORMAL, HORIZONTAL_NORMAL, PAR_LAMPS, getPhotometry, illuminanceAt } from './photometrics';

// 2D 화면용 반각 값. 실제 값은 photometrics.ts의 사양서 데이터에서 온다.
const fixedLensHalfAngles = (lens: keyof LensDataMap): LensSpec => {
  const phot = getPhotometry({
    id: '', label: '', type: 'ellipsoidal', lens_type: lens,
    position: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0 },
    is_visible: true, edge_softness: 0, shutter_active: false,
    shutter_polygon: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }]
  });
  return { beam: phot.beamA, field: phot.fieldA };
};

export const LensData: LensDataMap = {
  "19deg": fixedLensHalfAngles('19deg'),
  "26deg": fixedLensHalfAngles('26deg'),
  "36deg": fixedLensHalfAngles('36deg'),
  "51deg": fixedLensHalfAngles('51deg')
};

export const ZoomAngleRanges: Record<ZoomRangeType, { min: number; max: number; label: string }> = {
  narrow: { min: 15, max: 30, label: 'Narrow Zoom 15-30 deg' },
  medium: { min: 25, max: 50, label: 'Medium Zoom 25-50 deg' }
};

export const ParData: ParDataMap = PAR_LAMPS;

export interface EllipseResult {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

export interface FixtureAngles {
  tilt: number;
  pan: number;
}

export interface ProbeContribution {
  fixtureId: string;
  label: string;
  /** 객석 방향을 향한 얼굴 면의 조도 lux */
  faceLux: number;
  /** 수평면 조도 lux */
  horizontalLux: number;
  distance: number;
  /** 빔 중심에서 벗어난 각도 deg */
  angle: number;
  blockedByShutter: boolean;
  estimated: boolean;
}

export interface ProbeResult {
  x: number;
  y: number;
  actorHeight: number;
  faceLux: number;
  horizontalLux: number;
  contributions: ProbeContribution[];
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

  static fixtureHasShutters(fixture: Fixture): fixture is Extract<Fixture, { type: 'ellipsoidal' | 'zoom' }> {
    return fixture.type === 'ellipsoidal' || fixture.type === 'zoom';
  }

  /** 빔(50%)과 필드(10%)의 반각 deg. PAR는 두 축의 평균 */
  static getFixtureAngleSpec(fixture: Fixture): LensSpec {
    const phot = getPhotometry(fixture);
    return {
      beam: (phot.beamA + phot.beamB) / 2,
      field: (phot.fieldA + phot.fieldB) / 2
    };
  }

  static pointInPolygon(point: Position2D, polygon: Position2D[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects = ((yi > point.y) !== (yj > point.y))
        && (point.x < ((xj - xi) * (point.y - yi)) / Math.max(0.000001, yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  static calculateProbeBrightness(cue: Cue, stageConfig: StageConfig, probe: ProbeState): ProbeResult {
    const lamp = stageConfig.lamp ?? DEFAULT_LAMP;
    const point = { x: probe.x, y: probe.y, z: stageConfig.actor_height };

    const contributions = cue.fixtures
      .filter(fixture => fixture.is_visible !== false)
      .map(fixture => {
        const face = illuminanceAt(fixture, point, FACE_NORMAL, lamp);
        const horizontal = illuminanceAt(fixture, point, HORIZONTAL_NORMAL, lamp);
        return {
          fixtureId: fixture.id,
          label: fixture.label,
          faceLux: face.lux,
          horizontalLux: horizontal.lux,
          distance: face.distance,
          angle: face.offAxis,
          blockedByShutter: face.blockedByShutter,
          estimated: getPhotometry(fixture, lamp).estimated
        };
      })
      .sort((a, b) => b.faceLux - a.faceLux);

    return {
      x: probe.x,
      y: probe.y,
      actorHeight: point.z,
      faceLux: contributions.reduce((sum, item) => sum + item.faceLux, 0),
      horizontalLux: contributions.reduce((sum, item) => sum + item.horizontalLux, 0),
      contributions
    };
  }

  static calculateEllipse(fixture: Fixture, targetZ: number, angleType: 'beam' | 'field'): EllipseResult | null {
    const { x: x0, y: y0, z: z0 } = fixture.position;
    const { x: XT, y: YT } = fixture.target;

    const dxTarget = XT - x0;
    const dyTarget = YT - y0;
    const dFloor = Math.hypot(dxTarget, dyTarget);

    const pan = Math.atan2(dyTarget, dxTarget);
    const tilt = Math.atan2(dFloor, z0);

    const zDrop = z0 - targetZ;
    if (zDrop <= 0.1) return null;

    const angleSpec = this.getFixtureAngleSpec(fixture);
    const theta = this.toRad(angleSpec[angleType]);
    const denom = Math.pow(Math.cos(tilt), 2) - Math.pow(Math.sin(theta), 2);

    if (denom <= 0) return null;

    const rNear = zDrop * Math.tan(tilt - theta);
    const rFar = zDrop * Math.tan(tilt + theta);
    const dCenter = (rNear + rFar) / 2;

    const result: EllipseResult = {
      cx: x0 + dCenter * Math.cos(pan),
      cy: y0 + dCenter * Math.sin(pan),
      radiusX: Math.abs(rFar - rNear) / 2,
      radiusY: Math.abs((zDrop * Math.sin(theta)) / Math.sqrt(denom)),
      rotation: pan
    };

    if (fixture.type === 'par') {
      const par = ParData[fixture.lamp_type];
      const xAngle = angleType === 'beam' ? par.beamX : par.fieldX;
      const yAngle = angleType === 'beam' ? par.beamY : par.fieldY;
      const average = Math.max(0.0001, (xAngle + yAngle) / 2);
      result.radiusX *= xAngle / average;
      result.radiusY *= yAngle / average;
      result.rotation = pan + this.toRad(fixture.rotation_angle);
    }

    return result;
  }

  static projectFloorToFace(
    floorX: number,
    floorY: number,
    fixtureZ: number,
    actorH: number,
    fixtureX: number,
    fixtureY: number
  ): Position2D {
    const k = (fixtureZ - actorH) / Math.max(0.01, fixtureZ);
    return {
      x: fixtureX + (floorX - fixtureX) * k,
      y: fixtureY + (floorY - fixtureY) * k
    };
  }
}
