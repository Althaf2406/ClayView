export type SculptBrushSize = "FINE" | "MEDIUM" | "WIDE";

export const SCULPT_BRUSH_ORDER: readonly SculptBrushSize[] = [
  "MEDIUM",
  "FINE",
  "WIDE",
];

export interface SculptBrushParams {
  readonly size: SculptBrushSize;
  readonly label: string;
  readonly angularSpreadRad: number;
  readonly heightSpreadT: number;
}

export const SCULPT_BRUSH_CATALOG: Readonly<
  Record<SculptBrushSize, SculptBrushParams>
> = {
  FINE: {
    size: "FINE",
    label: "Brush: Fine (Jari)",
    angularSpreadRad: 0.28,
    heightSpreadT: 0.18,
  },
  MEDIUM: {
    size: "MEDIUM",
    label: "Brush: Medium",
    angularSpreadRad: 0.48,
    heightSpreadT: 0.26,
  },
  WIDE: {
    size: "WIDE",
    label: "Brush: Wide (Tangan)",
    angularSpreadRad: 0.78,
    heightSpreadT: 0.36,
  },
};

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DirectPullResult {
  readonly thetaRad: number;
  readonly tCenter: number;
  readonly deltaRadialMm: number;
  readonly deltaRimHeightCm: number;
}

/**
 * Pure TypeScript 2D Polar Freeform Sculpting Field for 100% manual Hand-Building clay.
 * Stores per-(angle, height) radial displacements (mm) and per-angle rim height offsets (cm),
 * enabling users to freely grab, pinch, pull out, push in, lift up, or dip down ANY exact spot
 * on the clay vessel manually with their hands or fingers.
 */
export class FreeformClayField {
  public static readonly ANGULAR_COLS = 32;
  public static readonly HEIGHT_ROWS = 11;
  public static readonly MAX_RADIAL_OFFSET_MM = 45.0;
  public static readonly MIN_RIM_HEIGHT_OFFSET_CM = -6.5;
  public static readonly MAX_RIM_HEIGHT_OFFSET_CM = 9.0;

  /** Flattened [col * HEIGHT_ROWS + row] radial offset in mm */
  private readonly radialOffsetsMm: number[];
  /** Per-angle rim vertical height offset in cm */
  private readonly rimHeightOffsetsCm: number[];

  constructor() {
    this.radialOffsetsMm = new Array(
      FreeformClayField.ANGULAR_COLS * FreeformClayField.HEIGHT_ROWS
    ).fill(0);
    this.rimHeightOffsetsCm = new Array(FreeformClayField.ANGULAR_COLS).fill(0);
  }

  public reset(): void {
    for (let i = 0; i < this.radialOffsetsMm.length; i++) {
      this.radialOffsetsMm[i] = 0;
    }
    for (let c = 0; c < this.rimHeightOffsetsCm.length; c++) {
      this.rimHeightOffsetsCm[c] = 0;
    }
  }

  public hasDeformation(): boolean {
    for (let i = 0; i < this.radialOffsetsMm.length; i++) {
      if (Math.abs(this.radialOffsetsMm[i]) > 0.05) return true;
    }
    for (let c = 0; c < this.rimHeightOffsetsCm.length; c++) {
      if (Math.abs(this.rimHeightOffsetsCm[c]) > 0.02) return true;
    }
    return false;
  }

  /**
   * Bilinearly samples the local radial offset (in cm) at any (t in [0,1], theta in radians).
   */
  public sampleRadialOffsetCm(t: number, thetaRad: number): number {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;

    const normTheta =
      (((thetaRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
      (Math.PI * 2);
    const fCol = normTheta * cols;
    const c0 = Math.floor(fCol) % cols;
    const c1 = (c0 + 1) % cols;
    const uc = fCol - Math.floor(fCol);

    const clampedT = Math.max(0, Math.min(1, t));
    const fRow = clampedT * (rows - 1);
    const r0 = Math.min(rows - 1, Math.floor(fRow));
    const r1 = Math.min(rows - 1, r0 + 1);
    const ur = fRow - r0;

    const v00 = this.radialOffsetsMm[c0 * rows + r0];
    const v10 = this.radialOffsetsMm[c1 * rows + r0];
    const v01 = this.radialOffsetsMm[c0 * rows + r1];
    const v11 = this.radialOffsetsMm[c1 * rows + r1];

    const bottom = v00 * (1 - uc) + v10 * uc;
    const top = v01 * (1 - uc) + v11 * uc;
    const mm = bottom * (1 - ur) + top * ur;
    return mm / 10.0;
  }

  /**
   * Linearly samples the local rim vertical height offset (in cm) at any angle thetaRad.
   */
  public sampleRimHeightOffsetCm(thetaRad: number): number {
    const cols = FreeformClayField.ANGULAR_COLS;
    const normTheta =
      (((thetaRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
      (Math.PI * 2);
    const fCol = normTheta * cols;
    const c0 = Math.floor(fCol) % cols;
    const c1 = (c0 + 1) % cols;
    const uc = fCol - Math.floor(fCol);
    return (
      this.rimHeightOffsetsCm[c0] * (1 - uc) + this.rimHeightOffsetsCm[c1] * uc
    );
  }

  /**
   * Computes the local height (cm) of a vertex at normalized height t and angle thetaRad,
   * smoothly scaling the vertical rim contour from 0 at the base (y=0) to full amplitude at the rim (t=1).
   */
  public computeLocalY(
    baseHeightCm: number,
    t: number,
    thetaRad: number
  ): number {
    const rimDelta = this.sampleRimHeightOffsetCm(thetaRad);
    const localMaxH = Math.max(3.0, baseHeightCm + rimDelta);
    return Math.max(0, Math.min(1, t)) * localMaxH;
  }

  /**
   * Applies a localized 3D Gaussian manual clay brush at angle `thetaRad` and normalized height `tCenter`.
   * - `deltaRadialMm`: pulls clay locally outward (+) or pushes/pinches inward (-) at that exact spot.
   * - `deltaRimHeightCm`: pulls that local section of the rim/wall upward (+) or dips it downward (-).
   */
  public applyLocalBrush(
    thetaRad: number,
    tCenter: number,
    deltaRadialMm: number,
    deltaRimHeightCm: number,
    angularSpreadRad: number = 0.48,
    heightSpreadT: number = 0.26
  ): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    const inv2SigA = 1.0 / (2.0 * angularSpreadRad * angularSpreadRad);
    const inv2SigH = 1.0 / (2.0 * heightSpreadT * heightSpreadT);

    for (let c = 0; c < cols; c++) {
      const colTheta = (c / cols) * Math.PI * 2.0;
      const dTheta = FreeformClayField.shortestAngleDiff(colTheta, thetaRad);
      const wAngle = Math.exp(-(dTheta * dTheta) * inv2SigA);
      if (wAngle < 0.015) continue;

      // Local radial wall pull/push
      if (Math.abs(deltaRadialMm) > 1e-4) {
        for (let r = 0; r < rows; r++) {
          const rt = r / (rows - 1);
          // Anchor bottom foot (r=0) slightly more firmly so clay stays seated on workboard
          const baseAnchor = r === 0 ? 0.3 : 1.0;
          const dt = rt - tCenter;
          const wHeight = Math.exp(-(dt * dt) * inv2SigH);
          const w = wAngle * wHeight * baseAnchor;
          if (w < 0.015) continue;

          const idx = c * rows + r;
          const next = this.radialOffsetsMm[idx] + deltaRadialMm * w;
          this.radialOffsetsMm[idx] = Math.max(
            -FreeformClayField.MAX_RADIAL_OFFSET_MM,
            Math.min(FreeformClayField.MAX_RADIAL_OFFSET_MM, next)
          );
        }
      }

      // Local rim height lift / dip (responsive across upper 72% of clay wall and rim!)
      if (Math.abs(deltaRimHeightCm) > 1e-4 && tCenter >= 0.28) {
        const rimWeight = Math.min(1.0, (tCenter - 0.22) / 0.45);
        const nextH =
          this.rimHeightOffsetsCm[c] + deltaRimHeightCm * wAngle * rimWeight;
        this.rimHeightOffsetsCm[c] = Math.max(
          FreeformClayField.MIN_RIM_HEIGHT_OFFSET_CM,
          Math.min(FreeformClayField.MAX_RIM_HEIGHT_OFFSET_CM, nextH)
        );
      }
    }
  }

  /**
   * Direct manual pinch-and-drag sculpting on any exact 3D point of the clay surface.
   * - Dragging away from the center axis pulls clay outward (e.g., forming a spout or bulge).
   * - Dragging toward the center axis pushes/indents clay inward (e.g., pinching a crease or wiggle).
   * - Dragging upward lifts that exact rim/wall section; dragging downward dips/pushes it down!
   */
  public applyDirectSurfacePull(
    grabLocal: Vec3Like,
    dragDeltaCm: Vec3Like,
    actualHeightCm: number,
    brushSize: SculptBrushSize = "MEDIUM",
    radialGain: number = 11.5,
    verticalGain: number = 1.1
  ): DirectPullResult {
    const brush = SCULPT_BRUSH_CATALOG[brushSize];
    const rHorizontal = Math.sqrt(
      grabLocal.x * grabLocal.x + grabLocal.z * grabLocal.z
    );
    const thetaRad =
      rHorizontal > 1e-4 ? Math.atan2(grabLocal.z, grabLocal.x) : Math.PI * 0.5;
    const localMaxH = Math.max(
      3.0,
      actualHeightCm + this.sampleRimHeightOffsetCm(thetaRad)
    );
    const tCenter = Math.max(0.05, Math.min(1.0, grabLocal.y / localMaxH));

    // Outward radial unit vector at the grabbed clay point
    const nx = Math.cos(thetaRad);
    const nz = Math.sin(thetaRad);
    const radialDeltaCm = dragDeltaCm.x * nx + dragDeltaCm.z * nz;

    const deltaRadialMm = radialDeltaCm * radialGain;
    const deltaRimHeightCm = dragDeltaCm.y * verticalGain;

    this.applyLocalBrush(
      thetaRad,
      tCenter,
      deltaRadialMm,
      deltaRimHeightCm,
      brush.angularSpreadRad,
      brush.heightSpreadT
    );

    return {
      thetaRad,
      tCenter,
      deltaRadialMm,
      deltaRimHeightCm,
    };
  }

  /**
   * Relaxes/smooths clay peaks & dents gently (like wiping with a damp potter's sponge).
   */
  public smooth(strength: number = 0.45): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    const nextR = [...this.radialOffsetsMm];
    const nextH = [...this.rimHeightOffsetsCm];

    for (let c = 0; c < cols; c++) {
      const cPrev = (c - 1 + cols) % cols;
      const cNext = (c + 1) % cols;
      const avgH =
        (this.rimHeightOffsetsCm[cPrev] +
          this.rimHeightOffsetsCm[c] * 2 +
          this.rimHeightOffsetsCm[cNext]) /
        4.0;
      nextH[c] =
        (this.rimHeightOffsetsCm[c] * (1 - strength) + avgH * strength) * 0.85;

      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        const avgR =
          (this.radialOffsetsMm[cPrev * rows + r] +
            this.radialOffsetsMm[idx] * 2 +
            this.radialOffsetsMm[cNext * rows + r]) /
          4.0;
        nextR[idx] =
          (this.radialOffsetsMm[idx] * (1 - strength) + avgR * strength) * 0.85;
      }
    }

    for (let i = 0; i < this.radialOffsetsMm.length; i++) {
      this.radialOffsetsMm[i] = nextR[i];
    }
    for (let c = 0; c < this.rimHeightOffsetsCm.length; c++) {
      this.rimHeightOffsetsCm[c] = nextH[c];
    }
  }

  public static getBrushLabel(size: SculptBrushSize): string {
    return SCULPT_BRUSH_CATALOG[size].label;
  }

  private static shortestAngleDiff(a: number, b: number): number {
    let diff = (a - b) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }
}
