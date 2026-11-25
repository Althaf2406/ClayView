import { ToleranceStatus } from "./ProfileDeltaEvaluator";
import {
  HandBuildingTechniqueId,
  SurfaceTreatmentId,
} from "./CeramicMaterialTypes";

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
   * Smoothly interpolates radius in cm at normalized height t in [0, 1] across the 5 zones
   * using Catmull-Rom spline interpolation for organic pottery silhouettes.
   */
  public static interpolateRadiusCm(
    zoneRadiiMm: readonly number[],
    t: number
  ): number {
    if (zoneRadiiMm.length === 0) return 5.0;
    if (zoneRadiiMm.length === 1) return zoneRadiiMm[0] / 10.0;
    const clampedT = Math.max(0, Math.min(1, t));
    const maxIndex = zoneRadiiMm.length - 1;
    const scaled = clampedT * maxIndex;
    const i1 = Math.min(maxIndex - 1, Math.floor(scaled));
    const i2 = i1 + 1;
    const i0 = Math.max(0, i1 - 1);
    const i3 = Math.min(maxIndex, i2 + 1);
    const u = scaled - i1;

    const p0 = zoneRadiiMm[i0];
    const p1 = zoneRadiiMm[i1];
    const p2 = zoneRadiiMm[i2];
    const p3 = zoneRadiiMm[i3];

    // Catmull-Rom cubic interpolation (clamped to avoid negative radii)
    const u2 = u * u;
    const u3 = u2 * u;
    const radiusMm =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u3);

    return Math.max(1.0, radiusMm / 10.0); // convert mm to cm
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
   * Builds a vertical CaliperGaugeLine with top/bottom target caliper arms, 5 zone ticks,
   * and an optional live actual-height marker bar.
   */
  public static buildCaliperGauge(
    wetHeightCm: number,
    color: RgbaColor = OPTICAL_PALETTE.CYAN,
    actualHeightCm?: number,
    actualColor: RgbaColor = OPTICAL_PALETTE.MATCH_TEAL
  ): LatheWireframeGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    const pushLine = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      lineColor: RgbaColor = color
    ) => {
      const base = vertices.length / 7;
      vertices.push(x0, y0, z0, lineColor.r, lineColor.g, lineColor.b, lineColor.a);
      vertices.push(x1, y1, z1, lineColor.r, lineColor.g, lineColor.b, lineColor.a);
      indices.push(base, base + 1);
    };

    const maxH =
      actualHeightCm !== undefined
        ? Math.max(wetHeightCm, actualHeightCm)
        : wetHeightCm;

    // Main vertical spine
    pushLine(0, 0, 0, 0, maxH, 0);
    // Top & bottom target horizontal caliper arms extending right toward the vessel
    pushLine(-0.8, 0, 0, 1.8, 0, 0);
    pushLine(-0.8, wetHeightCm, 0, 1.8, wetHeightCm, 0);
    // 5 zone tick marks along the target height spine
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * wetHeightCm;
      pushLine(-0.5, y, 0, 1.0, y, 0);
    }

    // Live actual-height caliper pointer when clay height differs from target
    if (
      actualHeightCm !== undefined &&
      Math.abs(actualHeightCm - wetHeightCm) > 0.05
    ) {
      pushLine(-1.2, actualHeightCm, 0, 2.4, actualHeightCm, 0, actualColor);
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 7,
      lineSegmentCount: indices.length / 2,
    };
  }

  /**
   * Builds a CCW-wound solid hollow-rim clay vessel (MeshTopology.Triangles)
   * adapted visually to the active Hand-Building technique (Pinching, Coiling,
   * Slab Building, or Kurinuki) and Surface Treatment (Sgraffito, Mishima,
   * Slip Trailing, Nerikomi, Burnishing, Faceting).
   */
  public static buildSolidVessel(
    actualHeightCm: number,
    actualRadiiMm: readonly number[],
    baseColor: RgbaColor = OPTICAL_PALETTE.CLAY_STONEWARE,
    radialSegments: number = 32,
    heightRings: number = 20,
    technique: HandBuildingTechniqueId = "PINCHING",
    surfaceTreatment: SurfaceTreatmentId = "NONE",
    compressedOrPaddled: boolean = true
  ): SolidMeshGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Technique-specific geometry resolution:
    // - SLAB_BUILDING & KURINUKI / FACETING use crisp architectural polygonal walls!
    const effectiveRadialSegs =
      surfaceTreatment === "FACETING"
        ? 10
        : technique === "SLAB_BUILDING"
        ? 8
        : technique === "KURINUKI"
        ? 7
        : radialSegments;
    const effectiveHeightRings =
      technique === "COILING" ? 28 : heightRings;

    const wallInsetCm = 0.12;
    const cols = effectiveRadialSegs + 1;

    // Outer wall rings
    for (let r = 0; r <= effectiveHeightRings; r++) {
      const t = r / effectiveHeightRings;
      const y = t * actualHeightCm;
      let rad = Math.max(
        0.8,
        this.interpolateRadiusCm(actualRadiiMm, t) - wallInsetCm
      );

      // Hand-building silhouette character
      let groove = 1.0;
      if (technique === "COILING") {
        // Pronounced stacked horizontal coil rings (smoothed when paddled/compressed)
        const coilAmp = compressedOrPaddled ? 0.045 : 0.14;
        const coilWave = Math.abs(Math.sin(t * Math.PI * 10.0));
        rad += (coilWave - 0.5) * (compressedOrPaddled ? 0.18 : 0.55);
        groove = 0.9 + coilAmp * coilWave;
      } else if (technique === "PINCHING") {
        // Gentle organic thumb-pinch undulation
        groove = 1.0 + 0.04 * Math.sin(t * Math.PI * 14.0);
      } else if (technique === "KURINUKI") {
        // Carved thick wabi-sabi block slight taper steps
        groove = 0.94 + 0.06 * Math.cos(t * Math.PI * 7.0);
      } else {
        // Slab building crisp flat walls
        groove = 1.0;
      }

      const shade = (0.76 + 0.24 * t) * groove;

      for (let c = 0; c <= effectiveRadialSegs; c++) {
        const theta = (c / effectiveRadialSegs) * Math.PI * 2.0;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let localRad = rad;
        if (technique === "PINCHING") {
          localRad += 0.09 * Math.sin(theta * 5.0 + t * 9.0);
        } else if (technique === "KURINUKI") {
          localRad += 0.16 * Math.cos(theta * 3.0 - t * 4.0);
        }

        let lightFactor =
          0.72 + 0.28 * Math.max(0, cosT * 0.6 + sinT * 0.4 + 0.4);
        let cr = baseColor.r;
        let cg = baseColor.g;
        let cb = baseColor.b;

        // Visual surface treatment preview on vertex colors
        if (surfaceTreatment === "SGRAFFITO") {
          // Dark slip coat with crisp carved light body bands
          const carved = Math.sin(theta * 6.0 + t * 12.0) > 0.55;
          if (!carved) {
            cr *= 0.48;
            cg *= 0.46;
            cb *= 0.50;
          } else {
            cr = Math.min(1, cr * 1.2);
            cg = Math.min(1, cg * 1.18);
            cb = Math.min(1, cb * 1.12);
          }
        } else if (surfaceTreatment === "MISHIMA") {
          // Flush dark inlaid geometric lines in light clay
          const inlayLine = Math.abs(Math.sin(t * Math.PI * 6.0)) < 0.16;
          if (inlayLine) {
            cr *= 0.35;
            cg *= 0.40;
            cb *= 0.52;
          }
        } else if (surfaceTreatment === "SLIP_TRAILING") {
          // Raised contrasting ivory dots/ribbons
          const trailRidge =
            Math.sin(theta * 8.0) > 0.65 && Math.sin(t * Math.PI * 8.0) > 0.0;
          if (trailRidge) {
            localRad += 0.18;
            cr = 0.94;
            cg = 0.92;
            cb = 0.85;
          }
        } else if (surfaceTreatment === "NERIKOMI") {
          // Marbled / agateware colored clay strata through wall
          const marble = Math.sin(theta * 3.0 + t * 14.0);
          if (marble > 0.3) {
            cr = 0.28;
            cg = 0.42;
            cb = 0.58;
          } else if (marble < -0.35) {
            cr = 0.92;
            cg = 0.88;
            cb = 0.80;
          }
        } else if (surfaceTreatment === "BURNISHING") {
          // Specular satin highlight band
          lightFactor = 0.8 + 0.38 * Math.pow(Math.max(0, cosT * 0.7 + sinT * 0.5 + 0.2), 2.0);
        }

        const f = shade * lightFactor;

        vertices.push(
          cosT * localRad,
          y,
          sinT * localRad,
          cosT,
          0.12,
          sinT,
          Math.min(1, cr * f),
          Math.min(1, cg * f),
          Math.min(1, cb * f),
          baseColor.a
        );
      }
    }

    for (let r = 0; r < effectiveHeightRings; r++) {
      for (let c = 0; c < effectiveRadialSegs; c++) {
        const bl = r * cols + c;
        const tl = (r + 1) * cols + c;
        const br = r * cols + (c + 1);
        const tr = (r + 1) * cols + (c + 1);
        indices.push(bl, tl, br);
        indices.push(tl, tr, br);
      }
    }

    // 2. TRUE CURVED INNER CAVITY WALL (mirrors outer Catmull-Rom profile inset by wallThicknessCm!)
    //    Guaranteed strictly inside outer wall at EVERY height t so it never self-intersects!
    const rimWallThicknessCm = technique === "KURINUKI" ? 1.35 : 0.65;
    const floorStartT = 0.14;
    const innerRings = Math.max(6, Math.round(effectiveHeightRings * 0.7));

    const computeOuterRadiusAt = (tVal: number, theta: number): number => {
      let rVal = Math.max(
        0.9,
        this.interpolateRadiusCm(actualRadiiMm, tVal) - wallInsetCm
      );
      if (technique === "COILING") {
        const coilWave = Math.abs(Math.sin(tVal * Math.PI * 10.0));
        rVal += (coilWave - 0.5) * (compressedOrPaddled ? 0.18 : 0.55);
      } else if (technique === "PINCHING") {
        rVal += 0.09 * Math.sin(theta * 5.0 + tVal * 9.0);
      } else if (technique === "KURINUKI") {
        rVal += 0.16 * Math.cos(theta * 3.0 - tVal * 4.0);
      }
      return Math.max(0.85, rVal);
    };

    const computeInnerRadiusAt = (tVal: number, theta: number): number => {
      const outerR = computeOuterRadiusAt(tVal, theta);
      // Taper gently toward the interior floor for an authentic curved potter's interior
      const floorCurve =
        tVal < floorStartT + 0.08
          ? 0.88 + 0.12 * ((tVal - floorStartT) / 0.08)
          : 1.0;
      return Math.max(0.35, (outerR - rimWallThicknessCm) * floorCurve);
    };

    // 2a. Smooth Top Rim Lip connecting outer rim (t=1) to inner rim (t=1), facing +Y
    const lipStart = vertices.length / 10;
    for (let c = 0; c <= effectiveRadialSegs; c++) {
      const theta = (c / effectiveRadialSegs) * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const outerRimR = computeOuterRadiusAt(1.0, theta);
      const innerRimR = computeInnerRadiusAt(1.0, theta);

      // Outer rim edge
      vertices.push(
        cosT * outerRimR,
        actualHeightCm,
        sinT * outerRimR,
        0,
        1,
        0,
        Math.min(1, baseColor.r * 1.14),
        Math.min(1, baseColor.g * 1.14),
        Math.min(1, baseColor.b * 1.14),
        1.0
      );
      // Inner rim edge
      vertices.push(
        cosT * innerRimR,
        actualHeightCm,
        sinT * innerRimR,
        0,
        1,
        0,
        Math.min(1, baseColor.r * 0.96),
        Math.min(1, baseColor.g * 0.96),
        Math.min(1, baseColor.b * 0.96),
        1.0
      );
    }
    for (let c = 0; c < effectiveRadialSegs; c++) {
      const o0 = lipStart + c * 2;
      const i0 = o0 + 1;
      const o1 = lipStart + (c + 1) * 2;
      const i1 = o1 + 1;
      // (i0 - o0) x (o1 - o0) points +Y (upward)
      indices.push(o0, i0, o1);
      indices.push(i0, i1, o1);
    }

    // 2b. Multi-Ring Curved Inner Cavity Wall (t from floorStartT up to 1.0, normals facing INWARD)
    const innerWallStart = vertices.length / 10;
    for (let ir = 0; ir <= innerRings; ir++) {
      const u = ir / innerRings;
      const tVal = floorStartT + u * (1.0 - floorStartT);
      const y = tVal * actualHeightCm;
      // Smooth warm interior gradient (brighter near rim, soft warm shadow at bottom — stays solid on SPECS!)
      const shade = 0.66 + 0.28 * u;

      for (let c = 0; c <= effectiveRadialSegs; c++) {
        const theta = (c / effectiveRadialSegs) * Math.PI * 2.0;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const innerR = computeInnerRadiusAt(tVal, theta);
        const lightFactor =
          0.78 + 0.22 * Math.max(0, -cosT * 0.5 - sinT * 0.4 + 0.5);
        const f = shade * lightFactor;

        vertices.push(
          cosT * innerR,
          y,
          sinT * innerR,
          -cosT,
          0.2,
          -sinT,
          Math.min(1, baseColor.r * f),
          Math.min(1, baseColor.g * f),
          Math.min(1, baseColor.b * f),
          1.0
        );
      }
    }

    for (let ir = 0; ir < innerRings; ir++) {
      for (let c = 0; c < effectiveRadialSegs; c++) {
        const bl = innerWallStart + ir * cols + c;
        const tl = innerWallStart + (ir + 1) * cols + c;
        const br = innerWallStart + ir * cols + (c + 1);
        const tr = innerWallStart + (ir + 1) * cols + (c + 1);
        // Reversed winding from outer wall so triangles face INWARD toward cavity center!
        indices.push(tl, bl, tr);
        indices.push(tr, bl, br);
      }
    }

    // 2c. Solid Inner Floor Cap at y = floorStartT * actualHeightCm (facing +Y)
    const floorY = floorStartT * actualHeightCm;
    const floorCenterIdx = vertices.length / 10;
    vertices.push(
      0,
      floorY,
      0,
      0,
      1,
      0,
      Math.min(1, baseColor.r * 0.62),
      Math.min(1, baseColor.g * 0.62),
      Math.min(1, baseColor.b * 0.62),
      1.0
    );
    const floorRingStart = vertices.length / 10;
    for (let c = 0; c <= effectiveRadialSegs; c++) {
      const theta = (c / effectiveRadialSegs) * Math.PI * 2.0;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const floorR = computeInnerRadiusAt(floorStartT, theta);
      vertices.push(
        cosT * floorR,
        floorY,
        sinT * floorR,
        0,
        1,
        0,
        Math.min(1, baseColor.r * 0.66),
        Math.min(1, baseColor.g * 0.66),
        Math.min(1, baseColor.b * 0.66),
        1.0
      );
    }
    for (let c = 0; c < effectiveRadialSegs; c++) {
      indices.push(floorCenterIdx, floorRingStart + c + 1, floorRingStart + c);
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 10,
      triangleCount: indices.length / 3,
    };
  }

  /**
   * Builds a compact glowing octahedron handle mesh for sculpting handles
   * in interleaved [x, y, z, r, g, b, a] format (MeshTopology.Triangles).
   */
  public static buildHandleDiamond(
    halfSizeCm: number,
    color: RgbaColor
  ): { vertices: number[]; indices: number[] } {
    const h = halfSizeCm;
    const hi = {
      r: Math.min(1, color.r * 1.1),
      g: Math.min(1, color.g * 1.1),
      b: Math.min(1, color.b * 1.1),
      a: 0.95,
    };
    const lo = {
      r: color.r * 0.78,
      g: color.g * 0.78,
      b: color.b * 0.78,
      a: 0.95,
    };

    const vertices: number[] = [
      // Top 4 faces (CCW outward)
      0, h, 0, hi.r, hi.g, hi.b, hi.a,  0, 0, h, lo.r, lo.g, lo.b, lo.a,   h, 0, 0, lo.r, lo.g, lo.b, lo.a,
      0, h, 0, hi.r, hi.g, hi.b, hi.a,  h, 0, 0, lo.r, lo.g, lo.b, lo.a,   0, 0, -h, lo.r, lo.g, lo.b, lo.a,
      0, h, 0, hi.r, hi.g, hi.b, hi.a,  0, 0, -h, lo.r, lo.g, lo.b, lo.a,  -h, 0, 0, lo.r, lo.g, lo.b, lo.a,
      0, h, 0, hi.r, hi.g, hi.b, hi.a,  -h, 0, 0, lo.r, lo.g, lo.b, lo.a,  0, 0, h, lo.r, lo.g, lo.b, lo.a,
      // Bottom 4 faces (CCW outward)
      0, -h, 0, lo.r, lo.g, lo.b, lo.a, h, 0, 0, hi.r, hi.g, hi.b, hi.a,   0, 0, h, hi.r, hi.g, hi.b, hi.a,
      0, -h, 0, lo.r, lo.g, lo.b, lo.a, 0, 0, -h, hi.r, hi.g, hi.b, hi.a,  h, 0, 0, hi.r, hi.g, hi.b, hi.a,
      0, -h, 0, lo.r, lo.g, lo.b, lo.a, -h, 0, 0, hi.r, hi.g, hi.b, hi.a,  0, 0, -h, hi.r, hi.g, hi.b, hi.a,
      0, -h, 0, lo.r, lo.g, lo.b, lo.a, 0, 0, h, hi.r, hi.g, hi.b, hi.a,   -h, 0, 0, hi.r, hi.g, hi.b, hi.a,
    ];
    const indices: number[] = [];
    for (let i = 0; i < 24; i++) indices.push(i);
    return { vertices, indices };
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

  /**
   * Builds a glowing concentric table-detection reticle (MeshTopology.Lines)
   * placed flat on the detected table surface during Step 1 (DETECT_TABLE).
   */
  public static buildTableReticle(
    outerRadiusCm: number = 14.5,
    innerRadiusCm: number = 9.5,
    color: RgbaColor = OPTICAL_PALETTE.CYAN
  ): LatheWireframeGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    const segments = 36;

    const addCircle = (rad: number, y: number, c: RgbaColor) => {
      const start = vertices.length / 7;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2.0;
        vertices.push(
          Math.cos(theta) * rad,
          y,
          Math.sin(theta) * rad,
          c.r,
          c.g,
          c.b,
          c.a
        );
        indices.push(start + i, start + ((i + 1) % segments));
      }
    };

    const addLine = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      c: RgbaColor
    ) => {
      const start = vertices.length / 7;
      vertices.push(x0, 0.15, z0, c.r, c.g, c.b, c.a);
      vertices.push(x1, 0.15, z1, c.r, c.g, c.b, c.a);
      indices.push(start, start + 1);
    };

    addCircle(outerRadiusCm, 0.15, color);
    addCircle(innerRadiusCm, 0.15, OPTICAL_PALETTE.MATCH_TEAL);
    // 4 cardinal crosshair ticks
    addLine(-outerRadiusCm - 2.0, 0, -innerRadiusCm, 0, color);
    addLine(innerRadiusCm, 0, outerRadiusCm + 2.0, 0, color);
    addLine(0, -outerRadiusCm - 2.0, 0, -innerRadiusCm, color);
    addLine(0, innerRadiusCm, 0, outerRadiusCm + 2.0, color);

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 7,
      lineSegmentCount: indices.length / 2,
    };
  }

  /**
   * Builds a neat 3D studio stack of reserve wedged clay balls (MeshTopology.Triangles)
   * sitting beside the pottery wheel to visually represent the selected batch Qty and Clay mass.
   * Each ball is a compact CCW oblate clay dome (flat bottom resting on the table).
   */
  public static buildClayStockPile(
    remainingBalls: number,
    ballRadiusCm: number = 1.9,
    clayColor: RgbaColor = OPTICAL_PALETTE.CLAY_STONEWARE
  ): SolidMeshGeometry {
    const count = Math.max(0, Math.min(12, Math.floor(remainingBalls)));
    const vertices: number[] = [];
    const indices: number[] = [];

    if (count === 0) {
      return { vertices, indices, vertexCount: 0, triangleCount: 0 };
    }

    const spacing = ballRadiusCm * 2.12;
    const latSteps = 6;
    const lonSteps = 12;

    // Precompute tidy 2-tier potter's tray positions (bottom 3x2 grid, top 3x2 nestled above)
    const offsets: Array<{ x: number; y: number; z: number }> = [];
    const cols = 3;
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / 6);
      const idxInLayer = i % 6;
      const col = idxInLayer % cols;
      const row = Math.floor(idxInLayer / cols);
      const x = (col - 1) * spacing + (layer === 1 ? spacing * 0.15 : 0);
      const z = (row - 0.5) * spacing;
      const y = layer * (ballRadiusCm * 1.48);
      offsets.push({ x, y, z });
    }

    for (let b = 0; b < offsets.length; b++) {
      const off = offsets[b];
      const baseVertex = vertices.length / 10;
      const rowCols = lonSteps + 1;

      for (let lat = 0; lat <= latSteps; lat++) {
        // Angle from flat base (phi = -0.35*PI) up to rounded dome apex (phi = +0.5*PI)
        const v = lat / latSteps;
        const phi = -0.25 * Math.PI + v * (0.75 * Math.PI);
        const rRing = Math.max(0.05, Math.cos(phi) * ballRadiusCm);
        const yLocal = (Math.sin(phi) + 0.71) * ballRadiusCm * 0.92;
        const shade = 0.72 + 0.28 * v;

        for (let lon = 0; lon <= lonSteps; lon++) {
          const theta = (lon / lonSteps) * Math.PI * 2.0;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const x = off.x + cosT * rRing;
          const y = off.y + Math.max(0, yLocal);
          const z = off.z + sinT * rRing;

          const nx = cosT * Math.cos(phi);
          const ny = Math.sin(phi);
          const nz = sinT * Math.cos(phi);
          const light = 0.75 + 0.25 * Math.max(0, nx * 0.5 + ny * 0.7 + nz * 0.4);
          const f = shade * light;

          vertices.push(
            x,
            y,
            z,
            nx,
            ny,
            nz,
            Math.min(1, clayColor.r * f),
            Math.min(1, clayColor.g * f),
            Math.min(1, clayColor.b * f),
            1.0
          );
        }
      }

      for (let lat = 0; lat < latSteps; lat++) {
        for (let lon = 0; lon < lonSteps; lon++) {
          const bl = baseVertex + lat * rowCols + lon;
          const tl = baseVertex + (lat + 1) * rowCols + lon;
          const br = baseVertex + lat * rowCols + (lon + 1);
          const tr = baseVertex + (lat + 1) * rowCols + (lon + 1);
          indices.push(bl, tl, br);
          indices.push(tl, tr, br);
        }
      }
    }

    return {
      vertices,
      indices,
      vertexCount: vertices.length / 10,
      triangleCount: indices.length / 3,
    };
  }
}
