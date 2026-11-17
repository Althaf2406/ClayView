export interface LatheWireframeGeometry {
  /** Interleaved [x, y, z, r, g, b, a] per vertex (stride = 7 floats) */
  readonly vertices: number[];
  /** Pairs of vertex indices for MeshTopology.Lines */
  readonly indices: number[];
  readonly vertexCount: number;
  readonly lineSegmentCount: number;
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
};

/**
 * Pure TypeScript procedural lathe wireframe generator for GhostProfileMesh.
 * Generates 16 vertical ribs and 6 horizontal contour rings in centimeters (cm)
 * from the 5 height zone radii (in mm) and total wet height (in cm).
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

  /**
   * Builds interleaved [x, y, z, r, g, b, a] vertex and index arrays for MeshTopology.Lines.
   */
  public static buildWireframe(
    wetHeightCm: number,
    zoneRadiiMm: readonly number[],
    ribColor: RgbaColor = OPTICAL_PALETTE.IVORY,
    ringColor: RgbaColor = OPTICAL_PALETTE.CYAN,
    ribCount: number = LatheMeshGenerator.DEFAULT_RIB_COUNT,
    ringCount: number = LatheMeshGenerator.DEFAULT_RING_COUNT
  ): LatheWireframeGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Create a grid of ringCount x ribCount vertices
    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const t = ringCount > 1 ? ringIdx / (ringCount - 1) : 0;
      const yCm = t * wetHeightCm;
      const radiusCm = this.interpolateRadiusCm(zoneRadiiMm, t);
      const isHighlightRing =
        ringIdx === 0 || ringIdx === Math.floor(ringCount / 2) || ringIdx === ringCount - 1;
      const color = isHighlightRing ? ringColor : ribColor;

      for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
        const theta = (ribIdx / ribCount) * Math.PI * 2.0;
        const xCm = Math.cos(theta) * radiusCm;
        const zCm = Math.sin(theta) * radiusCm;

        vertices.push(xCm, yCm, zCm, color.r, color.g, color.b, color.a);
      }
    }

    // Horizontal contour ring line segments
    for (let ringIdx = 0; ringIdx < ringCount; ringIdx++) {
      const baseOffset = ringIdx * ribCount;
      for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
        const current = baseOffset + ribIdx;
        const next = baseOffset + ((ribIdx + 1) % ribCount);
        indices.push(current, next);
      }
    }

    // Vertical rib line segments
    for (let ribIdx = 0; ribIdx < ribCount; ribIdx++) {
      for (let ringIdx = 0; ringIdx < ringCount - 1; ringIdx++) {
        const current = ringIdx * ribCount + ribIdx;
        const above = (ringIdx + 1) * ribCount + ribIdx;
        indices.push(current, above);
      }
    }

    const vertexCount = ringCount * ribCount;
    const lineSegmentCount = indices.length / 2;

    return {
      vertices,
      indices,
      vertexCount,
      lineSegmentCount,
    };
  }
}
