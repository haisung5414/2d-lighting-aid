// src/engine/geometry.ts

import type { Fixture, FresnelDataMap, LensDataMap, LensSpec, ParDataMap, Position2D } from '../types';

export const LensData: LensDataMap = {
  "19deg": { beam: 7.5, field: 9.5 },
  "26deg": { beam: 9.5, field: 13 },
  "36deg": { beam: 13, field: 18 },
  "51deg": { beam: 18, field: 25.5 }
};

export const ZoomAngleRange = { min: 15, max: 30 };

export const FresnelData: FresnelDataMap = {
  narrow: { beam: 4.5, field: 10 },
  medium: { beam: 10.5, field: 20 },
  flood: { beam: 26, field: 32.5 }
};

export const ParData: ParDataMap = {
  VNSP: { beamX: 6, beamY: 6, fieldX: 8, fieldY: 8 },
  NSP: { beamX: 8, beamY: 8, fieldX: 12, fieldY: 12 },
  MFL: { beamX: 12, beamY: 18, fieldX: 15, fieldY: 24 },
  WFL: { beamX: 15, beamY: 25, fieldX: 20, fieldY: 30 }
};

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

  static getFixtureAngleSpec(fixture: Fixture): LensSpec {
    if (fixture.type === 'ellipsoidal') {
      return LensData[fixture.lens_type];
    }

    if (fixture.type === 'zoom') {
      const halfAngle = fixture.zoom_angle / 2;
      return { beam: Math.max(1, halfAngle * 0.72), field: halfAngle };
    }

    if (fixture.type === 'fresnel') {
      const level = Math.min(1, Math.max(0, fixture.focus_level));
      const start = level <= 0.5 ? FresnelData.narrow : FresnelData.medium;
      const end = level <= 0.5 ? FresnelData.medium : FresnelData.flood;
      const t = level <= 0.5 ? level * 2 : (level - 0.5) * 2;

      return {
        beam: start.beam + (end.beam - start.beam) * t,
        field: start.field + (end.field - start.field) * t
      };
    }

    const par = ParData[fixture.lamp_type];
    return {
      beam: (par.beamX + par.beamY) / 2,
      field: (par.fieldX + par.fieldY) / 2
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
