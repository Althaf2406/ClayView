import { ClayDeformationState } from "./ClayWheelPhysicsEngine";

export type StudioFlowStage = "DETECT_TABLE" | "SELECT_CLAY" | "THROWING";

export type ClayMassId = "SMALL_450G" | "MEDIUM_900G" | "LARGE_1500G";

export interface ClayMassPreset {
  readonly id: ClayMassId;
  readonly grams: number;
  readonly displayLabel: string;
  /** Scale multiplier applied to the initial raw Globe Piece mound */
  readonly globeRadiusScale: number;
  readonly globeHeightCm: number;
}

export const CLAY_MASS_PRESETS: Record<ClayMassId, ClayMassPreset> = {
  SMALL_450G: {
    id: "SMALL_450G",
    grams: 450,
    displayLabel: "450g Small",
    globeRadiusScale: 0.84,
    globeHeightCm: 8.2,
  },
  MEDIUM_900G: {
    id: "MEDIUM_900G",
    grams: 900,
    displayLabel: "900g Medium",
    globeRadiusScale: 1.0,
    globeHeightCm: 10.4,
  },
  LARGE_1500G: {
    id: "LARGE_1500G",
    grams: 1500,
    displayLabel: "1.5kg Large",
    globeRadiusScale: 1.14,
    globeHeightCm: 12.6,
  },
};

const MASS_ORDER: readonly ClayMassId[] = [
  "SMALL_450G",
  "MEDIUM_900G",
  "LARGE_1500G",
];

export const SERIES_COUNT_OPTIONS: readonly number[] = [3, 6, 12];

export interface OrbitalBasis {
  /** Unit XZ vector pointing from wheel center toward camera */
  readonly toCamX: number;
  readonly toCamZ: number;
  /** Unit XZ vector pointing to the user's right when facing the wheel */
  readonly rightX: number;
  readonly rightZ: number;
  /** Yaw rotation in radians around +Y so local +Z faces the camera */
  readonly yawRad: number;
}

/**
 * Pure TypeScript controller for ClayView's 3-step pottery flow:
 * 1. DETECT_TABLE — scan & lock wheel anchor onto physical/preview table surface
 * 2. SELECT_CLAY  — choose clay amount (450g / 900g / 1.5kg), series count, clay type & vessel shape
 * 3. THROWING     — start shaping from a raw rounded Globe Piece clay mound on the spinning wheel
 *
 * Also computes 360-degree orbital camera-facing basis around WheelCenterAnchor so the
 * Studio Card, Caliper Gauge, and Sculpting Handles always face the user cleanly.
 */
export class ClayStudioFlowEngine {
  /** Base raw rounded dome/globe radii in mm (for 900g medium clay lump). */
  public static readonly BASE_GLOBE_RADII_MM: readonly [
    number,
    number,
    number,
    number,
    number
  ] = [64.0, 84.0, 86.0, 70.0, 42.0];

  public static nextMassPreset(current: ClayMassId): ClayMassId {
    const idx = MASS_ORDER.indexOf(current);
    return MASS_ORDER[(idx + 1) % MASS_ORDER.length];
  }

  public static getMassPreset(id: ClayMassId): ClayMassPreset {
    return CLAY_MASS_PRESETS[id];
  }

  public static nextSeriesCount(currentCount: number): number {
    const idx = SERIES_COUNT_OPTIONS.indexOf(currentCount);
    if (idx < 0) return 6;
    return SERIES_COUNT_OPTIONS[(idx + 1) % SERIES_COUNT_OPTIONS.length];
  }

  public static getStageTitle(stage: StudioFlowStage): string {
    switch (stage) {
      case "DETECT_TABLE":
        return "STEP 1/3 · DETECT TABLE";
      case "SELECT_CLAY":
        return "STEP 2/3 · SELECT CLAY";
      case "THROWING":
        return "STEP 3/3 · THROW CLAY";
    }
  }

  public static getStageActionLabel(stage: StudioFlowStage): string {
    switch (stage) {
      case "DETECT_TABLE":
        return "Lock Table";
      case "SELECT_CLAY":
        return "Start Throwing";
      case "THROWING":
        return "Reset Globe";
    }
  }

  /**
   * Computes the initial ClayDeformationState for a raw unshaped Globe Piece clay lump
   * relative to the current wet vessel target radii.
   */
  public static buildGlobePieceState(
    targetRadiiMm: readonly number[],
    massId: ClayMassId
  ): ClayDeformationState {
    const preset = CLAY_MASS_PRESETS[massId];
    const offsets: [number, number, number, number, number] = [0, 0, 0, 0, 0];

    for (let i = 0; i < 5; i++) {
      const globeRadiusMm = this.BASE_GLOBE_RADII_MM[i] * preset.globeRadiusScale;
      offsets[i] = Math.round((globeRadiusMm - targetRadiiMm[i]) * 100) / 100;
    }

    return {
      zoneOffsetsMm: offsets,
      actualHeightCm: preset.globeHeightCm,
    };
  }

  /**
   * Computes the horizontal orbital basis around WheelCenterAnchor so UI panels and
   * sculpting handles stay cleanly aligned to the user's viewing angle as they walk
   * 360 degrees around the pottery table.
   */
  public static computeOrbitalBasis(
    anchorPos: { readonly x: number; readonly z: number },
    cameraPos: { readonly x: number; readonly z: number }
  ): OrbitalBasis {
    const dx = cameraPos.x - anchorPos.x;
    const dz = cameraPos.z - anchorPos.z;
    const len = Math.sqrt(dx * dx + dz * dz);

    if (len < 1e-4) {
      return {
        toCamX: 0,
        toCamZ: 1,
        rightX: 1,
        rightZ: 0,
        yawRad: 0,
      };
    }

    const toCamX = dx / len || 0;
    const toCamZ = dz / len || 0;
    // Right-handed Y-up: user looks along -toCam, so user's right is (toCamZ, 0, -toCamX)
    const rightX = toCamZ || 0;
    const rightZ = -toCamX || 0;
    // Rotation around +Y mapping local +Z=(0,0,1) onto (toCamX, 0, toCamZ)
    const yawRad = Math.atan2(toCamX, toCamZ) || 0;

    return {
      toCamX,
      toCamZ,
      rightX,
      rightZ,
      yawRad,
    };
  }
}
