export type FreeformSculptPreset =
  | "WIGGLE_RIM"
  | "PINCH_SPOUT"
  | "ASYM_DIP"
  | "LOTUS_WAVE"
  | "SMOOTH";

export const FREEFORM_PRESET_ORDER: readonly FreeformSculptPreset[] = [
  "WIGGLE_RIM",
  "PINCH_SPOUT",
  "ASYM_DIP",
  "LOTUS_WAVE",
  "SMOOTH",
];

/**
 * Pure TypeScript 2D Polar Freeform Sculpting Field for asymmetric Hand-Building clay.
 * Stores per-(angle, height) radial displacements (mm) and per-angle rim height offsets (cm),
 * enabling non-symmetric spouts, wavy/wiggle rims, asymmetric dipped walls, lotus petals,
 * and true localized 3D finger/hand-tool pinching anywhere around the vessel.
 */
export class FreeformClayField {
  public static readonly ANGULAR_COLS = 24;
  public static readonly HEIGHT_ROWS = 9;
  public static readonly MAX_RADIAL_OFFSET_MM = 38.0;
  public static readonly MIN_RIM_HEIGHT_OFFSET_CM = -5.5;
  public static readonly MAX_RIM_HEIGHT_OFFSET_CM = 7.0;

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
   * smoothly scaling the vertical rim wave from 0 at the base (y=0) to full amplitude at the rim (t=1).
   */
  public computeLocalY(
    baseHeightCm: number,
    t: number,
    thetaRad: number
  ): number {
    const rimDelta = this.sampleRimHeightOffsetCm(thetaRad);
    const localMaxH = Math.max(3.5, baseHeightCm + rimDelta);
    return Math.max(0, Math.min(1, t)) * localMaxH;
  }

  /**
   * Applies a localized 3D Gaussian clay sculpting brush at angle `thetaRad` and normalized height `tCenter`.
   * - `deltaRadialMm`: pushes clay locally outward (+) or pinches inward (-) at that exact spot.
   * - `deltaRimHeightCm`: pulls that local section of the rim upward (+) or dips it downward (-).
   */
  public applyLocalBrush(
    thetaRad: number,
    tCenter: number,
    deltaRadialMm: number,
    deltaRimHeightCm: number,
    angularSpreadRad: number = 0.58,
    heightSpreadT: number = 0.28
  ): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    const inv2SigA = 1.0 / (2.0 * angularSpreadRad * angularSpreadRad);
    const inv2SigH = 1.0 / (2.0 * heightSpreadT * heightSpreadT);

    for (let c = 0; c < cols; c++) {
      const colTheta = (c / cols) * Math.PI * 2.0;
      const dTheta = FreeformClayField.shortestAngleDiff(colTheta, thetaRad);
      const wAngle = Math.exp(-(dTheta * dTheta) * inv2SigA);
      if (wAngle < 0.02) continue;

      // Local radial wall push/pinch
      if (Math.abs(deltaRadialMm) > 1e-4) {
        for (let r = 0; r < rows; r++) {
          const rt = r / (rows - 1);
          // Anchor bottom foot (r=0) slightly more firmly so clay stays seated on workboard
          const baseAnchor = r === 0 ? 0.35 : 1.0;
          const dt = rt - tCenter;
          const wHeight = Math.exp(-(dt * dt) * inv2SigH);
          const w = wAngle * wHeight * baseAnchor;
          if (w < 0.02) continue;

          const idx = c * rows + r;
          const next = this.radialOffsetsMm[idx] + deltaRadialMm * w;
          this.radialOffsetsMm[idx] = Math.max(
            -FreeformClayField.MAX_RADIAL_OFFSET_MM,
            Math.min(FreeformClayField.MAX_RADIAL_OFFSET_MM, next)
          );
        }
      }

      // Local rim height lift / dip (strongest when touching upper half / rim)
      if (Math.abs(deltaRimHeightCm) > 1e-4 && tCenter >= 0.45) {
        const rimWeight = Math.min(1.0, (tCenter - 0.35) / 0.5);
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
   * Photo 2 & 3 style: Organic "wiggle-wiggle" hand-pinched wavy rim & gently undulating upper wall.
   * Additive so repeated clicks deepen the wave, and user can freely hand-sculpt on top!
   */
  public applyWiggleRim(
    lobeCount: number = 6,
    radialWaveMm: number = 7.5,
    verticalWaveCm: number = 1.15
  ): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * Math.PI * 2.0;
      const wave =
        Math.sin(theta * lobeCount) * 0.72 +
        Math.cos(theta * (lobeCount - 2) + 0.9) * 0.28;

      this.rimHeightOffsetsCm[c] = Math.max(
        FreeformClayField.MIN_RIM_HEIGHT_OFFSET_CM,
        Math.min(
          FreeformClayField.MAX_RIM_HEIGHT_OFFSET_CM,
          this.rimHeightOffsetsCm[c] + wave * verticalWaveCm
        )
      );

      for (let r = 1; r < rows; r++) {
        const rt = r / (rows - 1);
        const topBias = Math.pow(rt, 1.5);
        const idx = c * rows + r;
        const next = this.radialOffsetsMm[idx] + wave * radialWaveMm * topBias;
        this.radialOffsetsMm[idx] = Math.max(
          -FreeformClayField.MAX_RADIAL_OFFSET_MM,
          Math.min(FreeformClayField.MAX_RADIAL_OFFSET_MM, next)
        );
      }
    }
  }

  /**
   * Photo 3 style: Pulls an ergonomic pouring spout on the facing angle `spoutThetaRad`,
   * gently pinching the neck beside the spout and lifting the spout lip.
   */
  public applyPinchSpout(spoutThetaRad: number = Math.PI * 0.5): void {
    // Pull spout channel outward & slightly up
    this.applyLocalBrush(spoutThetaRad, 0.94, 18.0, 1.4, 0.28, 0.32);
    // Pinch cheek indents right beside the spout to form crisp pouring lip
    this.applyLocalBrush(spoutThetaRad + 0.42, 0.88, -7.0, -0.3, 0.24, 0.26);
    this.applyLocalBrush(spoutThetaRad - 0.42, 0.88, -7.0, -0.3, 0.24, 0.26);
  }

  /**
   * Photo 1 & 4 style: Dramatic asymmetric sculptural vessel — sweeping dip/cutout on one side
   * and tall organic crest curving up on the opposite side.
   */
  public applyAsymmetricDip(dipThetaRad: number = Math.PI * 0.5): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * Math.PI * 2.0;
      const dDip = FreeformClayField.shortestAngleDiff(theta, dipThetaRad);
      // Smooth asymmetric dip at dipThetaRad, soaring crest opposite
      const dipFactor = Math.cos(dDip); // +1 at dip, -1 opposite
      const heightShift = -dipFactor * 3.2 - Math.exp(-(dDip * dDip) / 0.22) * 1.6;
      this.rimHeightOffsetsCm[c] = Math.max(
        FreeformClayField.MIN_RIM_HEIGHT_OFFSET_CM,
        Math.min(
          FreeformClayField.MAX_RIM_HEIGHT_OFFSET_CM,
          this.rimHeightOffsetsCm[c] + heightShift
        )
      );
      // Slight sculptural oval flare
      const ovalMm = Math.cos(dDip * 2.0) * 8.0;
      for (let r = 1; r < rows; r++) {
        const rt = r / (rows - 1);
        const idx = c * rows + r;
        const next = this.radialOffsetsMm[idx] + ovalMm * rt;
        this.radialOffsetsMm[idx] = Math.max(
          -FreeformClayField.MAX_RADIAL_OFFSET_MM,
          Math.min(FreeformClayField.MAX_RADIAL_OFFSET_MM, next)
        );
      }
    }
  }

  /**
   * Photo 5 style: Sculptural undulating lotus/petal candle-holder rim with 5 dramatic
   * curved high/low folded peaks and valleys.
   */
  public applyLotusWave(petals: number = 5): void {
    const cols = FreeformClayField.ANGULAR_COLS;
    const rows = FreeformClayField.HEIGHT_ROWS;
    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * Math.PI * 2.0;
      const petalWave = Math.sin(theta * petals);
      // High peaks & deep sculpted U-valleys
      const hDelta = petalWave * 2.8;
      this.rimHeightOffsetsCm[c] = Math.max(
        FreeformClayField.MIN_RIM_HEIGHT_OFFSET_CM,
        Math.min(
          FreeformClayField.MAX_RIM_HEIGHT_OFFSET_CM,
          this.rimHeightOffsetsCm[c] + hDelta
        )
      );
      // Fold petals slightly outward at peaks and tucked inward at valleys
      for (let r = 1; r < rows; r++) {
        const rt = r / (rows - 1);
        const idx = c * rows + r;
        const radialFold = petalWave * 10.5 * Math.pow(rt, 1.3);
        const next = this.radialOffsetsMm[idx] + radialFold;
        this.radialOffsetsMm[idx] = Math.max(
          -FreeformClayField.MAX_RADIAL_OFFSET_MM,
          Math.min(FreeformClayField.MAX_RADIAL_OFFSET_MM, next)
        );
      }
    }
  }

  /**
   * Relaxes/smooths freeform clay peaks & dents like wiping with a potter's damp sponge/rib.
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
        (this.rimHeightOffsetsCm[c] * (1 - strength) + avgH * strength) * 0.82;

      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        const avgR =
          (this.radialOffsetsMm[cPrev * rows + r] +
            this.radialOffsetsMm[idx] * 2 +
            this.radialOffsetsMm[cNext * rows + r]) /
          4.0;
        nextR[idx] =
          (this.radialOffsetsMm[idx] * (1 - strength) + avgR * strength) * 0.82;
      }
    }

    for (let i = 0; i < this.radialOffsetsMm.length; i++) {
      this.radialOffsetsMm[i] = nextR[i];
    }
    for (let c = 0; c < this.rimHeightOffsetsCm.length; c++) {
      this.rimHeightOffsetsCm[c] = nextH[c];
    }
  }

  public applyPreset(
    preset: FreeformSculptPreset,
    facingThetaRad: number = Math.PI * 0.5
  ): void {
    switch (preset) {
      case "WIGGLE_RIM":
        this.applyWiggleRim();
        break;
      case "PINCH_SPOUT":
        this.applyPinchSpout(facingThetaRad);
        break;
      case "ASYM_DIP":
        this.applyAsymmetricDip(facingThetaRad);
        break;
      case "LOTUS_WAVE":
        this.applyLotusWave();
        break;
      case "SMOOTH":
        this.smooth(0.55);
        break;
    }
  }

  public static getPresetLabel(preset: FreeformSculptPreset): string {
    switch (preset) {
      case "WIGGLE_RIM":
        return "Sculpt: +Wiggle Rim";
      case "PINCH_SPOUT":
        return "Sculpt: +Spout";
      case "ASYM_DIP":
        return "Sculpt: +Asym Dip";
      case "LOTUS_WAVE":
        return "Sculpt: +Lotus Wave";
      case "SMOOTH":
        return "Sculpt: Smooth Clay";
    }
  }

  private static shortestAngleDiff(a: number, b: number): number {
    let diff = (a - b) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }
}
