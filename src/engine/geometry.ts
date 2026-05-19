// src/engine/geometry.ts

import type { Cue, Fixture, FresnelDataMap, LensDataMap, LensSpec, ParDataMap, Position2D, ProbeState, StageConfig, ZoomRangeType } from '../types';

export const LensData: LensDataMap = {
  "19deg": { beam: 7.5, field: 9.5 },
  "26deg": { beam: 9.5, field: 13 },
  "36deg": { beam: 13, field: 18 },
  "51deg": { beam: 18, field: 25.5 }
};

export const ZoomAngleRanges: Record<ZoomRangeType, { min: number; max: number; label: string }> = {
  narrow: { min: 15, max: 30, label: 'Narrow Zoom 15-30 deg' },
  medium: { min: 25, max: 50, label: 'Medium Zoom 25-50 deg' }
};

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

export interface ProbeContribution {
  fixtureId: string;
  label: string;
  brightness: number;
  profile: number;
  distance: number;
  angle: number;
  blockedByShutter: boolean;
}

export interface ProbeResult {
  x: number;
  y: number;
  actorHeight: number;
  total: number;
  contributions: ProbeContribution[];
}

export class GeometryEngine {
  private static readonly REFERENCE_DISTANCE = 5;

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
      const range = ZoomAngleRanges[fixture.zoom_range];
      const fullAngle = Math.min(range.max, Math.max(range.min, fixture.zoom_angle));
      const halfAngle = fullAngle / 2;
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

  static smoothstep(edge0: number, edge1: number, value: number): number {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
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
    const probePoint = { x: probe.x, y: probe.y };
    const probeZ = stageConfig.actor_height;
    const contributions = cue.fixtures
      .filter(fixture => fixture.is_visible !== false)
      .map(fixture => {
        let blockedByShutter = false;
        if (this.fixtureHasShutters(fixture) && fixture.shutter_active) {
          const facePolygon = fixture.shutter_polygon.map(p => this.projectFloorToFace(
            fixture.target.x + p.dx,
            fixture.target.y + p.dy,
            fixture.position.z,
            probeZ,
            fixture.position.x,
            fixture.position.y
          ));
          blockedByShutter = !this.pointInPolygon(probePoint, facePolygon);
        }

        const centerVector = {
          x: fixture.target.x - fixture.position.x,
          y: fixture.target.y - fixture.position.y,
          z: -fixture.position.z
        };
        const probeVector = {
          x: probe.x - fixture.position.x,
          y: probe.y - fixture.position.y,
          z: probeZ - fixture.position.z
        };

        const centerLength = Math.hypot(centerVector.x, centerVector.y, centerVector.z);
        const probeDistance = Math.hypot(probeVector.x, probeVector.y, probeVector.z);
        const dot = centerVector.x * probeVector.x + centerVector.y * probeVector.y + centerVector.z * probeVector.z;
        const angle = Math.acos(Math.min(1, Math.max(-1, dot / Math.max(0.000001, centerLength * probeDistance))));
        const spec = this.getFixtureAngleSpec(fixture);
        const beam = this.toRad(spec.beam);
        const field = this.toRad(spec.field);

        let profile = 0;
        if (!blockedByShutter && angle < field) {
          profile = angle <= beam ? 1 : 1 - this.smoothstep(beam, field, angle);
        }

        if (!blockedByShutter && fixture.type === 'par') {
          profile = this.calculateParProbeProfile(fixture, probePoint, probeZ);
        }

        const distanceFactor = Math.pow(this.REFERENCE_DISTANCE / Math.max(0.1, probeDistance), 2);
        const brightness = blockedByShutter ? 0 : profile * distanceFactor * 100;

        return {
          fixtureId: fixture.id,
          label: fixture.label,
          brightness,
          profile,
          distance: probeDistance,
          angle: this.toDeg(angle),
          blockedByShutter
        };
      })
      .sort((a, b) => b.brightness - a.brightness);

    return {
      x: probe.x,
      y: probe.y,
      actorHeight: probeZ,
      total: contributions.reduce((sum, item) => sum + item.brightness, 0),
      contributions
    };
  }

  private static calculateParProbeProfile(fixture: Extract<Fixture, { type: 'par' }>, point: Position2D, targetZ: number): number {
    const beam = this.calculateEllipse(fixture, targetZ, 'beam');
    const field = this.calculateEllipse(fixture, targetZ, 'field');
    if (!beam || !field) return 0;

    const normalizedDistance = (ellipse: EllipseResult): number => {
      const cos = Math.cos(-ellipse.rotation);
      const sin = Math.sin(-ellipse.rotation);
      const dx = point.x - ellipse.cx;
      const dy = point.y - ellipse.cy;
      const rx = Math.max(0.0001, ellipse.radiusX);
      const ry = Math.max(0.0001, ellipse.radiusY);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      return Math.hypot(localX / rx, localY / ry);
    };

    const beamDistance = normalizedDistance(beam);
    if (beamDistance <= 1) return 1;

    const fieldDistance = normalizedDistance(field);
    if (fieldDistance >= 1) return 0;

    const t = (beamDistance - 1) / Math.max(0.0001, beamDistance - fieldDistance);
    return 1 - this.smoothstep(0, 1, t);
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
