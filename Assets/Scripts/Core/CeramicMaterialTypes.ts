import { ClayType } from "./KilnShrinkageEngine";
import { RgbaColor } from "./LatheMeshGenerator";

/**
 * 4 standardized studio moisture stages from the Ceramic Materials Encyclopedia:
 * plastic -> leather-hard -> bone-dry -> bisqueware
 */
export type MoistureState =
  | "plastic"
  | "leather-hard"
  | "bone-dry"
  | "bisqueware";

export const MOISTURE_STATE_ORDER: readonly MoistureState[] = [
  "plastic",
  "leather-hard",
  "bone-dry",
  "bisqueware",
];

/**
 * 5-stage sequential user workflow state machine:
 * 1. SELECT_CLAY_BODY -> 2. SHAPING_HANDBUILDING (MAIN FOCUS)
 * -> [Dekorasi] 3. DECORATION_OPTIONS -> [Pembakaran] 4. FIRING_OPTIONS
 * -> 5. FINAL_RESULT
 */
export type CeramicWorkflowStage =
  | "SELECT_CLAY_BODY"
  | "SHAPING_HANDBUILDING"
  | "DECORATION_OPTIONS"
  | "FIRING_OPTIONS"
  | "FINAL_RESULT";

export type ClayBodyId =
  | "EARTHENWARE"
  | "STONEWARE"
  | "PORCELAIN"
  | "PAPER_CLAY";

export interface ClayBodySpec {
  readonly id: ClayBodyId;
  readonly name: string;
  readonly coneRangeLabel: string;
  /** Numeric Orton cone scale where 010 = -10, 04 = -4, 5 = 5, 10 = 10 */
  readonly minConeNumeric: number;
  readonly maxConeNumeric: number;
  readonly tempMinC: number;
  readonly tempMaxC: number;
  readonly shrinkageMinPct: number;
  readonly shrinkageMaxPct: number;
  /** Representative default shrinkage fraction (0.0 - 1.0) for 1:1 wet/fired calculations */
  readonly defaultShrinkageRate: number;
  readonly waterAbsorptionLabel: string;
  readonly typicalAbsorptionPct: number;
  /** Digitalfire direct flame thermal shock survival time in seconds */
  readonly thermalShockSeconds: number;
  readonly thermalShockRating: "Highest" | "High" | "Medium" | "Lowest";
  readonly mechanicalStrengthLabel: string;
  /** Bone-dry green strength multiplier relative to conventional clay (~2.0x for Paper Clay) */
  readonly greenStrengthMultiplier: number;
  readonly supportsWetToDryJoining: boolean;
  readonly supportsRawGlazing: boolean;
  readonly requiresBurnoutVentilation: boolean;
  readonly fragileAtBisque: boolean;
  readonly watertightWithoutGlaze: boolean;
  readonly primaryRisks: readonly string[];
  readonly wetColor: RgbaColor;
  readonly firedColor: RgbaColor;
  readonly legacyClayType: ClayType;
}

/**
 * MAIN FOCUS (Category 1): Strictly limited to the 4 Hand-Building techniques.
 */
export type HandBuildingTechniqueId =
  | "PINCHING"
  | "COILING"
  | "SLAB_BUILDING"
  | "KURINUKI";

export interface HandBuildingTechniqueSpec {
  readonly id: HandBuildingTechniqueId;
  readonly name: string;
  readonly indonesianName: string;
  readonly activeMoistureStages: readonly MoistureState[];
  readonly recommendedWallMinMm: number;
  readonly recommendedWallMaxMm: number;
  readonly recommendedBaseMinMm: number;
  readonly recommendedBaseMaxMm: number;
  readonly slabThicknessGuideMm?: {
    readonly smallCupBox: string;
    readonly bowl: string;
    readonly largeVessel: string;
  };
  readonly keyMechanism: string;
  readonly keyTools: readonly string[];
  readonly primaryDefects: readonly string[];
}

export type VesselScaleCategory = "small" | "bowl" | "large";

export interface HandBuildingProcessParams {
  readonly technique: HandBuildingTechniqueId;
  readonly moistureState: MoistureState;
  readonly vesselScale: VesselScaleCategory;
  /** Rim thickness in mm (used to detect Pinching rim cracking < 3 mm) */
  readonly rimThicknessMm: number;
  /** Mid-wall thickness in mm */
  readonly wallThicknessMm: number;
  /** Base thickness in mm (used to detect Pinching drying cracks & Kurinuki bottom cracking) */
  readonly baseThicknessMm: number;
  /** Whether score & slip mechanical lock was applied on joints (Coiling / Slab) */
  readonly scoreAndSlipApplied: boolean;
  /** Whether wall/joints were compressed with rib or paddle */
  readonly compressedOrPaddled: boolean;
  /** Whether slab was rolled in two perpendicular directions to neutralize clay memory */
  readonly bidirectionalSlabRolled: boolean;
  /** Whether coils had noticeable moisture mismatch between layers */
  readonly moistureMismatchBetweenLayers: boolean;
  /** Drying speed before firing */
  readonly dryingRate: "slow" | "normal" | "fast";
}

/**
 * Secondary Flow (Category 2): Surface Decoration & Mechanical Surface Modification
 * (Excludes wheel-only Chattering/Tobikanna).
 */
export type SurfaceTreatmentId =
  | "NONE"
  | "SGRAFFITO"
  | "MISHIMA"
  | "SLIP_TRAILING"
  | "NERIKOMI"
  | "BURNISHING"
  | "FACETING";

export type SurfaceTreatmentCategory =
  | "NONE"
  | "SLIP_AND_BODY"
  | "MECHANICAL_MODIFICATION";

export interface SurfaceTreatmentSpec {
  readonly id: SurfaceTreatmentId;
  readonly name: string;
  readonly category: SurfaceTreatmentCategory;
  readonly idealMoistureStages: readonly MoistureState[];
  readonly maxSafeFiringTempC: number | null;
  readonly incompatibleWithGlaze: boolean;
  readonly leavesPorousNonFoodSafe: boolean;
  readonly summary: string;
  readonly primaryRisks: readonly string[];
}

export type GlazeApplicationMethodId =
  | "NONE"
  | "DIPPING"
  | "POURING"
  | "SPRAYING_HVLP"
  | "BRUSHING";

export interface GlazeApplicationSpec {
  readonly id: GlazeApplicationMethodId;
  readonly name: string;
  readonly specificGravityRange: string;
  readonly requiresSprayBoothRespirator: boolean;
  readonly summary: string;
  readonly primaryRisks: readonly string[];
}

/**
 * Glaze Fit Engine (Coefficient of Thermal Expansion / CTE):
 * - OPTIMAL: mild glaze compression -> maximizes ceramic strength
 * - HIGH_CTE_CRAZING: glaze CTE > clay body CTE -> tension cracks, strength drops 3-4x
 * - LOW_CTE_SHIVERING: glaze CTE << clay body CTE -> razor-sharp glass flakes spalling off
 */
export type GlazeCteFitMode =
  | "OPTIMAL"
  | "HIGH_CTE_CRAZING"
  | "LOW_CTE_SHIVERING";

export interface SurfaceTreatmentSelection {
  readonly surfaceTreatment: SurfaceTreatmentId;
  readonly glazeMethod: GlazeApplicationMethodId;
  readonly glazeCteFit: GlazeCteFitMode;
  /** Whether decorative slip uses the same base clay body shrinkage */
  readonly slipMatchesBody: boolean;
  /** Moisture stage at which slip/mechanical decoration was performed */
  readonly appliedAtMoisture: MoistureState;
  /** Whether glaze is applied directly onto bone-dry greenware (Raw Glazing) */
  readonly rawGlazeAttempted: boolean;
  /** Whether body uses coarse grog (affects sharp carving like Sgraffito) */
  readonly coarseGrogBody: boolean;
}

/**
 * Secondary Flow (Category 3): Firing Methods & Kiln Atmospheres
 */
export type FiringMethodId =
  | "PIT_OPEN"
  | "WESTERN_RAKU"
  | "OBVARA"
  | "HORSEHAIR_RAKU"
  | "SAGGAR"
  | "ELECTRIC_OXIDATION"
  | "GAS_REDUCTION"
  | "WOOD_ANAGAMA"
  | "SALT_SODA";

export type FiringCategory = "LOW_FIRE_DECORATIVE" | "HIGH_FIRE_FUNCTIONAL";

export interface FiringMethodSpec {
  readonly id: FiringMethodId;
  readonly name: string;
  readonly category: FiringCategory;
  readonly coneRangeLabel: string;
  readonly minConeNumeric: number;
  readonly maxConeNumeric: number;
  readonly tempMinC: number;
  readonly tempMaxC: number;
  readonly representativePeakTempC: number;
  readonly atmosphere: string;
  readonly isFoodSafeCapable: boolean;
  readonly isWatertightCapable: boolean;
  readonly bannedInElectricKiln: boolean;
  readonly thermalShockSeverity: "EXTREME" | "HIGH" | "MODERATE" | "LOW";
  readonly producesNaturalCrazing: boolean;
  readonly requiresOutdoorOrAcidRespirator: boolean;
  readonly visualEffect: string;
  readonly safetyNotes: string;
}

export interface FiringScheduleParams {
  readonly method: FiringMethodId;
  /** True if user attempts to run vapor/saggar firing inside an Electric Kanthal kiln */
  readonly useElectricKilnHost: boolean;
  /** Orton heatwork rate: slow (15 C/h), medium (60 C/h), fast (150 C/h) */
  readonly heatingRate: "slow" | "medium" | "fast";
  /** Kiln cooling schedule: controlled, normal, or fast (early kiln opening) */
  readonly coolingRate: "controlled" | "normal" | "fast";
  /** Whether slow 0-150 C candling was completed on bone-dry greenware */
  readonly candlingComplete: boolean;
  /** Whether stoneware bisque was fired too low (Cone 06 instead of Cone 02) */
  readonly lowBisqueCone: boolean;
  /** Whether active downdraft kiln ventilation / outdoor airflow is enabled */
  readonly ventilationActive: boolean;
  /** Optional override for target firing temperature in C (e.g. testing Earthenware Cone 02+) */
  readonly targetPeakTempOverrideC?: number;
}

export type ThermalMilestoneId =
  | "WATER_EVAP_150C"
  | "QUARTZ_INVERSION_573C"
  | "DECOMPOSITION_700_1000C"
  | "CRISTOBALITE_COOL_226C";

export type MilestoneStatus = "SAFE" | "WARNING" | "CRITICAL";

export interface ThermalMilestoneReport {
  readonly id: ThermalMilestoneId;
  readonly tempLabel: string;
  readonly title: string;
  readonly status: MilestoneStatus;
  readonly detail: string;
}

export type DefectSeverity = "INFO" | "WARNING" | "CRITICAL" | "BLOCKED";

export type DefectStage =
  | "CLAY_BODY"
  | "SHAPING"
  | "DECORATION"
  | "GLAZE_FIT"
  | "FIRING"
  | "SAFETY";

export interface DefectIssue {
  readonly code: string;
  readonly severity: DefectSeverity;
  readonly stage: DefectStage;
  readonly title: string;
  readonly explanation: string;
  readonly remedy: string;
}

export type SimulationStatus =
  | "Success"
  | "Warning (Minor Defect)"
  | "Failed (Structural/Thermal Failure)";

export type GlazeFitEvaluation = "NONE" | "Optimal" | "Crazing" | "Shivering";

export interface VesselDimensionsCm {
  readonly heightCm: number;
  readonly maxDiameterCm: number;
}

export interface SimulationInput {
  readonly clayBody: ClayBodyId;
  readonly shaping: HandBuildingProcessParams;
  readonly surface: SurfaceTreatmentSelection;
  readonly firing: FiringScheduleParams;
  readonly wetDimensionsCm: VesselDimensionsCm;
}

export interface SimulationResult {
  readonly status: SimulationStatus;
  readonly isFoodSafe: boolean;
  readonly isWatertight: boolean;
  readonly glazeFitStatus: GlazeFitEvaluation;
  readonly peakTempC: number;
  readonly wetDimensionsCm: VesselDimensionsCm;
  readonly firedDimensionsCm: VesselDimensionsCm;
  readonly appliedShrinkagePct: number;
  readonly thermalMilestones: readonly ThermalMilestoneReport[];
  readonly issues: readonly DefectIssue[];
  readonly safetyWarnings: readonly string[];
  readonly visualSummary: string;
  readonly firedTintColor: RgbaColor;
}
