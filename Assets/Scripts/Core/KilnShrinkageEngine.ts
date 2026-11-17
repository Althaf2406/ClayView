export type ClayType =
  | "STONEWARE_0"
  | "LOW_FIRE_10"
  | "STONEWARE_12"
  | "PORCELAIN_14";

export interface ClayPreset {
  readonly type: ClayType;
  readonly shrinkRate: number;
  readonly displayLabel: string;
}

export interface FiredVesselSpec {
  readonly presetName: string;
  readonly firedHeightCm: number;
  readonly zoneFiredRadiiMm: readonly [number, number, number, number, number];
}

export interface WetVesselTarget {
  readonly clayType: ClayType;
  readonly shrinkRate: number;
  readonly wetHeightCm: number;
  readonly wetRadiiMm: readonly [number, number, number, number, number];
}

export const CLAY_PRESETS: Record<ClayType, ClayPreset> = {
  STONEWARE_0: {
    type: "STONEWARE_0",
    shrinkRate: 0.0,
    displayLabel: "0% STONEWARE",
  },
  LOW_FIRE_10: {
    type: "LOW_FIRE_10",
    shrinkRate: 0.10,
    displayLabel: "10% LOW-FIRE",
  },
  STONEWARE_12: {
    type: "STONEWARE_12",
    shrinkRate: 0.12,
    displayLabel: "12% STONEWARE",
  },
  PORCELAIN_14: {
    type: "PORCELAIN_14",
    shrinkRate: 0.14,
    displayLabel: "14% PORCELAIN",
  },
};

const CYCLE_ORDER: readonly ClayType[] = [
  "STONEWARE_0",
  "LOW_FIRE_10",
  "STONEWARE_12",
  "PORCELAIN_14",
];

export class KilnShrinkageEngine {
  public static getShrinkRate(clayType: ClayType): number {
    return CLAY_PRESETS[clayType].shrinkRate;
  }

  public static getDisplayLabel(clayType: ClayType): string {
    return CLAY_PRESETS[clayType].displayLabel;
  }

  public static nextClayType(current: ClayType): ClayType {
    const idx = CYCLE_ORDER.indexOf(current);
    const nextIdx = (idx + 1) % CYCLE_ORDER.length;
    return CYCLE_ORDER[nextIdx];
  }

  public static calculateWetDimension(
    firedDimension: number,
    clayTypeOrRate: ClayType | number
  ): number {
    if (firedDimension < 0) {
      throw new Error("Fired dimension cannot be negative.");
    }

    const shrinkRate =
      typeof clayTypeOrRate === "number"
        ? clayTypeOrRate
        : this.getShrinkRate(clayTypeOrRate);

    if (shrinkRate < 0 || shrinkRate >= 1.0) {
      throw new Error(`Invalid shrinkage rate: ${shrinkRate}`);
    }

    return firedDimension / (1.0 - shrinkRate);
  }

  public static computeWetTarget(
    spec: FiredVesselSpec,
    clayType: ClayType
  ): WetVesselTarget {
    const shrinkRate = this.getShrinkRate(clayType);
    const wetHeightCm = this.calculateWetDimension(spec.firedHeightCm, shrinkRate);
    const wetRadiiMm = spec.zoneFiredRadiiMm.map((r) =>
      this.calculateWetDimension(r, shrinkRate)
    ) as unknown as readonly [number, number, number, number, number];

    return {
      clayType,
      shrinkRate,
      wetHeightCm,
      wetRadiiMm,
    };
  }

  public static formatHeightCm(heightCm: number, decimals: number = 2): string {
    return `${heightCm.toFixed(decimals)} cm`;
  }
}
