import { ToleranceStatus } from "./ProfileDeltaEvaluator";

export interface LatheWireframeGeometry {
  /** Interleaved [x, y, z, r, g, b, a] per vertex (stride = 7 floats) */
  readonly vertices: number[];
  /** Pairs of vertex indices for MeshTopology.Lines */
  readonly indices: number[];
  readonly vertexCount: number;
  readonly lineSegmentCount: number;
}

export interface SolidMeshGeometry {
  /** Interleaved [x, y, z, nx, ny, nz, r, g, b, a] per vertex (stride = 10 floats) */
  readonly vertices: number[];
  /** CCW triangle indices for MeshTopology.Triangles */
  readonly indices: number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const OPTICAL_PALETTE = {
  IVORY: { r: 1.0, g: 0.99, b: 0.96, a: 0.65 } as RgbaColor,
  CYAN: { r: 0.29, g: 0.95, b: 1.0, a: 0.65 } as RgbaColor,
  MATCH_TEAL: { r: 0.18, g: 0.9, b: 0.62, a: 0.65 } as RgbaColor,
  WARN_AMBER: { r: 1.0, g: 0.78, b: 0.34, a: 0.65 } as RgbaColor,
  ALERT_CORAL: { r: 1.0, g: 0.42, b: 0.42, a: 0.65 } as RgbaColor,
  CLAY_STONEWARE: { r: 0.62, g: 0.44, b: 0.34, a: 1.0 } as RgbaColor,
  CLAY_PORCELAIN: { r: 0.86, g: 0.85, b: 0.83, a: 1.0 } as RgbaColor,
  WHEEL_BAT: { r: 0.32, g: 0.35, b: 0.39, a: 1.0 } as RgbaColor,
};

/**
 * Pure TypeScript procedural geometry generator for ClayView:
 * - GhostProfileMesh (16 vertical ribs + 6 contour rings, MeshTopology.Lines)
 * - CaliperGaugeLine (vertical height ruler + 5 zone ticks, MeshTopology.Lines)
 * - SpinningClayMesh (smooth CCW rotational vessel stand-in, MeshTopology.Triangles)
 * - PotteryWheelBat (CCW rotating wheel head platter, MeshTopology.Triangles)
 */
export class LatheMeshGenerator {
  public static readonly DEFAULT_RIB_COUNT = 16;
  public static readonly DEFAULT_RING_COUNT = 6;

  /**
   * Interpolates radius in cm at normalized height t in [0, 1] across the 5 zones.
   */
  public static interpolateRadiusCm(
    zoneRadiiMm: readonly number[],
    t: number
  ): number {
    if (zoneRadiiMm.length === 0) return 5.0;
    const clampedT = Math.max(0, Math.min(1, t));
    const maxIndex = zoneRadiiMm.length - 1;
    const scaled = clampedT * maxIndex;
    const lowIdx = Math.floor(scaled);
    const highIdx = Math.min(maxIndex, lowIdx + 1);
    const frac = scaled - lowIdx;
    const radiusMm =
      zoneRadiiMm[lowIdx] * (1 - frac) + zoneRadiiMm[highIdx] * frac;
    return radiusMm / 10.0; // convert mm to cm
  }

  public static colorForToleranceStatus(
    status: ToleranceStatus,
    fallbackColor: RgbaColor = OPTICAL_PALETTE.IVORY
  ): RgbaColor {
    switch (status) {
      case "OVER_CORAL":
      case "UNDER_CORAL":
        return OPTICAL_PALETTE.ALERT_CORAL;
      case "WARN_AMBER":
        return OPTICAL_PALETTE.WARN_AMBER;
      case "MATCH_TEAL":
        return OPTICAL_PALETTE.MATCH_TEAL;
      default:
        return fallbackColor;
    }
  }

  /**
   * Builds interleaved [x, y, z, r, g, b, a] vertex and index arrays for GhostProfileMesh (MeshTopology.Lines).
   */
  public static buildWireframe(
    wetHeightCm: number,
    zoneRadiiMm: readonly number[],
    ribColor: RgbaColor = OPTICAL_PALETTE.IVORY,
    ringColor: RgbaColor = OPTICAL_PALETTE.CYAN,
    ribCount: number = LatheMeshGenerator.DEFAULT_RIB_COUNT,
    ringCount: number = LatheMeshGenerator.DEFAULT_RING_COUNT,
    zoneStatuses?: readonly ToleranceStatus[]
  ): LatheWireframeGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const t = ringCount > 1 ? ringIdx / (ringCount - 1) : 0;
      const yCm = t * wetHeightCm;
      const radiusCm = this.interpolateRadiusCm(zoneRadiiMm, t);
      const isHighlightRing =
        ringIdx === 0 ||
        ringIdx === Math.floor(ringCount / 2) ||
        ringIdx === ringCount - 1;

      let color = isHighlightRing ? ringColor : ribColor;
      if (zoneStatuses && zoneStatuses.length === 5) {
        const zoneIdx = Math.min(4, Math.round(t * 4));
        const st = zoneStatuses[zoneIdx];
        if (st === "OVER_CORAL" || st === "UNDER_CORAL") {
          color = OPTICAL_PALETTE.ALERT_CORAL;
        } else if (st === "WARN_AMBER") {
          color = OPTICAL_PALETTE.WARN_AMBER;
        }
      }

      for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
        const theta = (ribIdx / ribCount) * Math.PI * 2.0;
        const xCm = Math.cos(theta) * radiusCm;
        const zCm = Math.sin(theta) * radiusCm;
        vertices.push(xCm, yCm, zCm, color.r, color.g, color.b, color.a);
      }
    }

    // Horizontal contour rings
    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const baseOffset = ringIdx * ribCount;
      for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
        const current = baseOffset + ribIdx;
        const next = baseOffset + ((ribIdx + 1) % ribCount);
        indices.push(current, next);
      }
    }

    // Vertical ribs
    for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
      for (let ringIdx = 0; ringIdx < ringCount - 1; ringIdx++) {
        const current = ringIdx * ribCount + ribIdx;
        const above = (ringIdx + 1) * ribCount + ribIdx;
        indices.push(current, above);
      }
    }

    return {
      vertices,
      indices,
      vertexCount: ringCount * ribCount,
      lineSegmentCount: indices.length / 2,
    };
  }

  /**
   * Builds a vertical CaliperGaugeLine with top/bottom caliper arms and 5 zone tick marks
   * in interleaved [x, y, z, r, g, b, a] format for MeshTopology.Lines.
   */
  public static buildCaliperGauge(
    wetHeightCm: number,
    color: RgbaColor = OPTICAL_PALETTE.CYAN
  ): LatheWireframeGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    const pushLine = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number
    ) => {
      const base = vertices.length / 7;
      vertices.push(x0, y0, z0, color.r, color.g, color.b, color.a);
      vertices.push(x1, y1, z1, color.r, color.g, color.b, color.a);
      indices.push(base, base + 1);
    };

    // Main vertical spine
    pushLine(0, 0, 0, 0, wetHeightCm, 0);
    // Top & bottom horizontal caliper arms extending right toward the vessel
    pushLine(-0.8, 0, 0, 1.8, 0, 0);
    pushLine(-0.8, wetHeightCm, 0, 1.8, wetHeightCm, 0);
    // 5 zone tick marks along the vertical spine
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * wetHeightCm;
      pushLine(-0.5, y, 0, 1.0, y, 0);
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 7,
      lineSegmentCount: indices.length / 2,
    };
  }

  /**
   * Builds a CCW-wound solid rotational clay vessel (MeshTopology.Triangles)
   * with interleaved [x, y, z, nx, ny, nz, r, g, b, a] vertices (stride = 10).
   */
  public static buildSolidVessel(
    wetHeightCm: number,
    actualRadiiMm: readonly number[],
    baseColor: RgbaColor = OPTICAL_PALETTE.CLAY_STONEWARE,
    radialSegments: number = 28,
    heightRings: number = 12
  ): SolidMeshGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Outer wall rings (slightly inset by 0.12 cm so 1:1 wireframe hugs outside cleanly)
    const wallInsetCm = 0.12;
    const cols = radialSegments + 1;

    for (let r = 0; r <= heightRings; r++) {
      const t = r / heightRings;
      const y = t * wetHeightCm;
      const rad = Math.max(
        0.5,
        this.interpolateRadiusCm(actualRadiiMm, t) - wallInsetCm
      );

      // Subtle vertical shading gradient + throwing grooves for clay realism
      const groove = 1.0 + 0.04 * Math.sin(t * Math.PI * 16.0);
      const shade = (0.78 + 0.22 * t) * groove;

      for (let c = 0; c <= radialSegments; c++) {
        const theta = (c / radialSegments) * Math.PI * 2.0;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const x = cosT * rad;
        const z = sinT * rad;

        // Simple directional highlight baked gently into vertex color for unlit vertex shader
        const lightFactor = 0.72 + 0.28 * Math.max(0, cosT * 0.6 + sinT * 0.4 + 0.4);
        const f = shade * lightFactor;

        vertices.push(
          x,
          y,
          z,
          cosT,
          0.15,
          sinT,
          Math.min(1, baseColor.r * f),
          Math.min(1, baseColor.g * f),
          Math.min(1, baseColor.b * f),
          baseColor.a
        );
      }
    }

    // CCW winding when viewed from outside (+X cross +Y = +Z):
    // theta increases from +X toward +Z (clockwise from top +Y), so along increasing theta we go RIGHT-to-LEFT on front (+Z).
    // Verify cross product at theta=0 (x=R, z=0), normal=(+1,0,0):
    // v0=(R, y0, 0), v1=(R, y1, 0) [up], v2=(R*cos, y0, R*sin) [+Z]
    // (v1-v0) x (v2-v0) = (0, +dy, 0) x (0, 0, +dz) = (+dy*dz, 0, 0) -> points OUTWARD (+X)!
    for (let r = 0; r < heightRings; r++) {
      for (let c = 0; c < radialSegments; c++) {
        const bl = r * cols + c;
        const tl = (r + 1) * cols + c;
        const br = r * cols + (c + 1);
        const tr = (r + 1) * cols + (c + 1);

        // Triangle 1: bl -> tl -> br (cross = up x +theta = outward!)
        indices.push(bl, tl, br);
        // Triangle 2: tl -> tr -> br
        indices.push(tl, tr, br);
      }
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 10,
      triangleCount: indices.length / 3,
    };
  }

  /**
   * Builds a CCW-wound circular pottery wheel bat platter (top at y=0, bottom at y=-1.2 cm).
   */
  public static buildWheelBat(
    radiusCm: number = 12.0,
    thicknessCm: number = 1.2,
    segments: number = 32,
    color: RgbaColor = OPTICAL_PALETTE.WHEEL_BAT
  ): SolidMeshGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Top cap center (y = 0, normal = (0, 1, 0))
    const topCenterIdx = 0;
    vertices.push(
      0,
      0,
      0,
      0,
      1,
      0,
      color.r * 1.15,
      color.g * 1.15,
      color.b * 1.15,
      1.0
    );

    // Top ring
    const topRingStart = 1;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2.0;
      const x = Math.cos(theta) * radiusCm;
      const z = Math.sin(theta) * radiusCm;
      vertices.push(x, 0, z, 0, 1, 0, color.r, color.g, color.b, 1.0);
    }

    // Top cap CCW viewed from +Y: (v1-center) x (v2-center) must point +Y.
    // At theta=0 -> (+R,0,0), theta=+d -> (+R,0,+dz): (+R,0,0) x (+R,0,+dz) = (0, -R*dz, 0) (-Y).
    // So reverse order: (center, i+1, i) gives +Y!
    for (let i = 0; i < segments; i++) {
      indices.push(topCenterIdx, topRingStart + i + 1, topRingStart + i);
    }

    // Side wall (y=0 to y=-thicknessCm)
    const sideTopStart = vertices.length / 10;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = cosT * radiusCm;
      const z = sinT * radiusCm;
      vertices.push(
        x,
        0,
        z,
        cosT,
        0,
        sinT,
        color.r * 0.85,
        color.g * 0.85,
        color.b * 0.85,
        1.0
      );
      vertices.push(
        x,
        -thicknessCm,
        z,
        cosT,
        0,
        sinT,
        color.r * 0.65,
        color.g * 0.65,
        color.b * 0.65,
        1.0
      );
    }

    for (let i = 0; i < segments; i++) {
      const tl = sideTopStart + i * 2;
      const bl = tl + 1;
      const tr = sideTopStart + (i + 1) * 2;
      const br = tr + 1;
      indices.push(bl, tl, br);
      indices.push(tl, tr, br);
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 10,
      triangleCount: indices.length / 3,
    };
  }
}
