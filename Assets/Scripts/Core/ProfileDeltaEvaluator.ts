export type ZoneName = "Base" | "LowerBelly" | "Belly" | "Shoulder" | "Rim";

export type ToleranceStatus =
  | "MATCH_TEAL"
  | "WARN_AMBER"
  | "OVER_CORAL"
  | "UNDER_CORAL";

export interface ZoneEvaluation {
  readonly zoneIndex: number;
  readonly zoneName: ZoneName;
  readonly targetRadiusMm: number;
  readonly actualRadiusMm: number;
  readonly signedDeltaMm: number;
  readonly absDeltaMm: number;
  readonly status: ToleranceStatus;
}

export interface ProfileEvaluationSummary {
  readonly zones: readonly ZoneEvaluation[];
  readonly matchPercentage: number;
  readonly maxDeviationMm: number;
  readonly allZonesStable: boolean;
}

export const VESSEL_ZONE_NAMES: readonly ZoneName[] = [
  "Base",
  "LowerBelly",
  "Belly",
  "Shoulder",
  "Rim",
];

export class ProfileDeltaEvaluator {
  public static readonly TEAL_THRESHOLD_MM = 2.0;
  public static readonly AMBER_THRESHOLD_MM = 4.0;

  public static evaluateZone(
    targetRadiusMm: number,
    actualRadiusMm: number,
    zoneIndex: number
  ): ZoneEvaluation {
    const rawDelta = actualRadiusMm - targetRadiusMm;
    const signedDeltaMm = Math.round(rawDelta * 100) / 100;
    const absDeltaMm = Math.round(Math.abs(signedDeltaMm) * 100) / 100;
    const zoneName = VESSEL_ZONE_NAMES[zoneIndex] ?? "Belly";

    let status: ToleranceStatus = "MATCH_TEAL";
    if (absDeltaMm > this.AMBER_THRESHOLD_MM) {
      status = signedDeltaMm >= 0 ? "OVER_CORAL" : "UNDER_CORAL";
    } else if (absDeltaMm > this.TEAL_THRESHOLD_MM) {
      status = "WARN_AMBER";
    }

    return {
      zoneIndex,
      zoneName,
      targetRadiusMm,
      actualRadiusMm,
      signedDeltaMm,
      absDeltaMm,
      status,
    };
  }

  public static evaluateProfile(
    targetRadiiMm: readonly number[],
    actualRadiiMm: readonly number[]
  ): ProfileEvaluationSummary {
    if (targetRadiiMm.length !== 5 || actualRadiiMm.length !== 5) {
      throw new Error("Profile evaluation requires exactly 5 height zones.");
    }

    const zones: ZoneEvaluation[] = targetRadiiMm.map((target, index) =>
      this.evaluateZone(target, actualRadiiMm[index], index)
    );

    const matchPercentage = this.calculateMatchPercentage(zones);
    const maxDeviationMm = zones.reduce(
      (max, z) => (z.absDeltaMm > max ? z.absDeltaMm : max),
      0
    );
    const allZonesStable = zones.every((z) => z.status === "MATCH_TEAL");

    return {
      zones,
      matchPercentage,
      maxDeviationMm,
      allZonesStable,
    };
  }

  public static calculateMatchPercentage(
    evaluations: readonly ZoneEvaluation[]
  ): number {
    if (evaluations.length === 0) return 100;

    let totalScore = 0;
    for (const evaluation of evaluations) {
      if (evaluation.status === "MATCH_TEAL") {
        totalScore += 100;
      } else if (evaluation.status === "WARN_AMBER") {
        totalScore += 70;
      } else {
        totalScore += 30;
      }
    }

    return Math.round(totalScore / evaluations.length);
  }
}
