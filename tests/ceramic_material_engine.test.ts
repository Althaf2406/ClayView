import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CLAY_BODY_CATALOG,
  FIRING_METHOD_CATALOG,
  HAND_BUILDING_CATALOG,
} from "../Assets/Scripts/Core/CeramicMaterialCatalog";
import { CeramicCompatibilityEngine } from "../Assets/Scripts/Core/CeramicCompatibilityEngine";
import {
  FiringMethodId,
  SimulationInput,
} from "../Assets/Scripts/Core/CeramicMaterialTypes";
import { LatheMeshGenerator } from "../Assets/Scripts/Core/LatheMeshGenerator";
import { FreeformClayField } from "../Assets/Scripts/Core/FreeformClayField";

function createBaselineInput(
  overrides?: Partial<{
    clayBody: SimulationInput["clayBody"];
    shaping: Partial<SimulationInput["shaping"]>;
    surface: Partial<SimulationInput["surface"]>;
    firing: Partial<SimulationInput["firing"]>;
    wetDimensionsCm: SimulationInput["wetDimensionsCm"];
  }>
): SimulationInput {
  return {
    clayBody: overrides?.clayBody ?? "STONEWARE",
    shaping: {
      technique: "PINCHING",
      moistureState: "bisqueware",
      vesselScale: "bowl",
      rimThicknessMm: 5.0,
      wallThicknessMm: 6.0,
      baseThicknessMm: 7.0,
      scoreAndSlipApplied: true,
      compressedOrPaddled: true,
      bidirectionalSlabRolled: true,
      moistureMismatchBetweenLayers: false,
      dryingRate: "slow",
      ...(overrides?.shaping ?? {}),
    },
    surface: {
      surfaceTreatment: "NONE",
      glazeMethod: "DIPPING",
      glazeCteFit: "OPTIMAL",
      slipMatchesBody: true,
      appliedAtMoisture: "leather-hard",
      rawGlazeAttempted: false,
      coarseGrogBody: false,
      ...(overrides?.surface ?? {}),
    },
    firing: {
      method: "ELECTRIC_OXIDATION",
      useElectricKilnHost: false,
      heatingRate: "medium",
      coolingRate: "controlled",
      candlingComplete: true,
      lowBisqueCone: false,
      ventilationActive: true,
      ...(overrides?.firing ?? {}),
    },
    wetDimensionsCm: overrides?.wetDimensionsCm ?? {
      heightCm: 18.18,
      maxDiameterCm: 17.05,
    },
  };
}

describe("Ceramic Material Science & Compatibility Engine", () => {
  describe("Category 4: Clay Bodies Catalog & Shrinkage Math", () => {
    test("defines all 4 clay bodies with encyclopedia specs and computes final fired shrinkage", () => {
      assert.equal(CLAY_BODY_CATALOG.EARTHENWARE.thermalShockSeconds, 25);
      assert.equal(CLAY_BODY_CATALOG.STONEWARE.typicalAbsorptionPct <= 3.0, true);
      assert.equal(CLAY_BODY_CATALOG.PORCELAIN.typicalAbsorptionPct <= 0.5, true);
      assert.equal(CLAY_BODY_CATALOG.PORCELAIN.thermalShockSeconds, 5);
      assert.equal(CLAY_BODY_CATALOG.PAPER_CLAY.greenStrengthMultiplier, 2.0);
      assert.equal(CLAY_BODY_CATALOG.PAPER_CLAY.supportsWetToDryJoining, true);
      assert.equal(CLAY_BODY_CATALOG.PAPER_CLAY.supportsRawGlazing, true);
      assert.equal(CLAY_BODY_CATALOG.PAPER_CLAY.fragileAtBisque, true);

      const res = CeramicCompatibilityEngine.evaluate(createBaselineInput());
      assert.equal(res.status, "Success");
      assert.equal(res.isFoodSafe, true);
      assert.equal(res.isWatertight, true);
      assert.equal(res.glazeFitStatus, "Optimal");
      assert.equal(res.appliedShrinkagePct, 12.0);
      assert.equal(res.firedDimensionsCm.heightCm, 16.0);
    });
  });

  describe("Category 1 (MAIN FOCUS): 4 Hand-Building Techniques Validation", () => {
    test("only exposes the 4 required Hand-Building techniques and builds distinct 3D meshes", () => {
      const keys = Object.keys(HAND_BUILDING_CATALOG);
      assert.deepEqual(keys.sort(), [
        "COILING",
        "KURINUKI",
        "PINCHING",
        "SLAB_BUILDING",
      ]);

      const radii = [45, 70, 85, 77, 85];
      const pinchMesh = LatheMeshGenerator.buildSolidVessel(
        14,
        radii,
        undefined,
        32,
        20,
        "PINCHING"
      );
      const slabMesh = LatheMeshGenerator.buildSolidVessel(
        14,
        radii,
        undefined,
        32,
        20,
        "SLAB_BUILDING"
      );
      const kurinukiMesh = LatheMeshGenerator.buildSolidVessel(
        14,
        radii,
        undefined,
        32,
        20,
        "KURINUKI",
        "SGRAFFITO"
      );
      // Slab & Kurinuki use architectural polygonal facets (fewer radial segments than 32-seg Pinching)
      assert.equal(slabMesh.triangleCount < pinchMesh.triangleCount, true);
      assert.equal(kurinukiMesh.triangleCount > 0, true);
    });

    test("Pinching detects rim cracking (<3mm) and drying cracks (thick base vs wall)", () => {
      const res = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          shaping: {
            technique: "PINCHING",
            rimThicknessMm: 2.2,
            wallThicknessMm: 5.0,
            baseThicknessMm: 14.0,
          },
        })
      );
      assert.equal(res.status, "Warning (Minor Defect)");
      assert.equal(
        res.issues.some((i) => i.code === "PINCHING_RIM_CRACKING"),
        true
      );
      assert.equal(
        res.issues.some((i) => i.code === "PINCHING_DRYING_CRACKS"),
        true
      );
    });

    test("Coiling detects seam delamination, moisture mismatch, Porcelain warning, and Paper Clay wet-to-dry pass", () => {
      const badCoil = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "PORCELAIN",
          shaping: {
            technique: "COILING",
            scoreAndSlipApplied: false,
            moistureMismatchBetweenLayers: true,
          },
        })
      );
      assert.equal(badCoil.status, "Failed (Structural/Thermal Failure)");
      assert.equal(
        badCoil.issues.some((i) => i.code === "COILING_NO_SCORE_SLIP"),
        true
      );
      assert.equal(
        badCoil.issues.some((i) => i.code === "COILING_MOISTURE_MISMATCH"),
        true
      );
      assert.equal(
        badCoil.issues.some((i) => i.code === "COILING_PORCELAIN_WARNING"),
        true
      );

      // Paper Clay supports wet-to-dry joining!
      const paperCoil = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "PAPER_CLAY",
          shaping: {
            technique: "COILING",
            scoreAndSlipApplied: true,
            compressedOrPaddled: true,
            moistureMismatchBetweenLayers: true,
          },
        })
      );
      assert.equal(
        paperCoil.issues.some((i) => i.code === "COILING_MOISTURE_MISMATCH"),
        false
      );
      assert.equal(
        paperCoil.issues.some((i) => i.code === "COILING_PAPER_CLAY_WET_TO_DRY_OK"),
        true
      );
    });

    test("Slab Building detects <4mm failure, clay memory warping, and corner cracking", () => {
      const badSlab = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          shaping: {
            technique: "SLAB_BUILDING",
            wallThicknessMm: 3.2,
            bidirectionalSlabRolled: false,
            scoreAndSlipApplied: false,
          },
        })
      );
      assert.equal(badSlab.status, "Failed (Structural/Thermal Failure)");
      assert.equal(
        badSlab.issues.some((i) => i.code === "SLAB_TOO_THIN"),
        true
      );
      assert.equal(
        badSlab.issues.some((i) => i.code === "SLAB_CLAY_MEMORY_WARPING"),
        true
      );
      assert.equal(
        badSlab.issues.some((i) => i.code === "SLAB_CORNER_CRACKING"),
        true
      );
    });

    test("Kurinuki detects bottom cracking gradient and fast-drying steam explosion risk", () => {
      const badKurinuki = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          shaping: {
            technique: "KURINUKI",
            wallThicknessMm: 14.0,
            baseThicknessMm: 28.0,
            dryingRate: "fast",
          },
        })
      );
      assert.equal(badKurinuki.status, "Failed (Structural/Thermal Failure)");
      assert.equal(
        badKurinuki.issues.some((i) => i.code === "KURINUKI_BOTTOM_CRACKING"),
        true
      );
      assert.equal(
        badKurinuki.issues.some((i) => i.code === "KURINUKI_FAST_DRY_STEAM_RISK"),
        true
      );
    });
  });

  describe("Category 2: Decoration, HVLP Safety & Glaze Fit (CTE) Engine", () => {
    test("Burnishing >1000 C or combined with Glazing fails and flags non-food-safe", () => {
      const highFireBurnish = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "STONEWARE",
          surface: {
            surfaceTreatment: "BURNISHING",
            glazeMethod: "DIPPING",
          },
          firing: { method: "ELECTRIC_OXIDATION" },
        })
      );
      assert.equal(highFireBurnish.status, "Failed (Structural/Thermal Failure)");
      assert.equal(highFireBurnish.isFoodSafe, false);
      assert.equal(highFireBurnish.isWatertight, false);
      assert.equal(
        highFireBurnish.issues.some(
          (i) => i.code === "BURNISHING_DESTROYED_OVER_1000C"
        ),
        true
      );
      assert.equal(
        highFireBurnish.issues.some(
          (i) => i.code === "BURNISHING_GLAZE_INCOMPATIBLE"
        ),
        true
      );
    });

    test("Glaze Fit (CTE) evaluates Crazing (3-4x weaker) and Shivering (Failed) + HVLP safety warning", () => {
      const crazed = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "EARTHENWARE",
          surface: {
            glazeMethod: "SPRAYING_HVLP",
            glazeCteFit: "HIGH_CTE_CRAZING",
          },
          firing: { method: "ELECTRIC_OXIDATION" },
        })
      );
      assert.equal(crazed.glazeFitStatus, "Crazing");
      assert.equal(crazed.status, "Warning (Minor Defect)");
      assert.equal(crazed.isFoodSafe, false); // porous earthenware + crazing is non-food-safe
      assert.equal(
        crazed.safetyWarnings.some((w) => w.includes("HVLP")),
        true
      );

      const shivered = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          surface: {
            glazeMethod: "DIPPING",
            glazeCteFit: "LOW_CTE_SHIVERING",
          },
        })
      );
      assert.equal(shivered.glazeFitStatus, "Shivering");
      assert.equal(shivered.status, "Failed (Structural/Thermal Failure)");
      assert.equal(shivered.isFoodSafe, false);
    });

    test("Paper Clay supports Raw Glazing while conventional Stoneware fails raw glazing", () => {
      const paperRaw = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "PAPER_CLAY",
          shaping: { moistureState: "bone-dry" },
          surface: { glazeMethod: "DIPPING", rawGlazeAttempted: true },
        })
      );
      assert.equal(paperRaw.status, "Success");
      assert.equal(
        paperRaw.issues.some((i) => i.code === "RAW_GLAZING_PAPER_CLAY_OK"),
        true
      );

      const stonewareRaw = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "STONEWARE",
          shaping: { moistureState: "bone-dry" },
          surface: { glazeMethod: "DIPPING", rawGlazeAttempted: true },
        })
      );
      assert.equal(stonewareRaw.status, "Failed (Structural/Thermal Failure)");
      assert.equal(
        stonewareRaw.issues.some((i) => i.code === "RAW_GLAZING_CONVENTIONAL_RISK"),
        true
      );
    });
  });

  describe("Category 3 & Cross-Stage Compatibility Matrix + Thermal Milestones", () => {
    test("MANDATORY: Earthenware + Wood / Gas / Salt Firing (Cone 8-13) -> Failed (meltdown/bloating)", () => {
      const highFires: FiringMethodId[] = [
        "WOOD_ANAGAMA",
        "GAS_REDUCTION",
        "SALT_SODA",
      ];
      for (const method of highFires) {
        const res = CeramicCompatibilityEngine.evaluate(
          createBaselineInput({
            clayBody: "EARTHENWARE",
            firing: { method },
          })
        );
        assert.equal(res.status, "Failed (Structural/Thermal Failure)");
        assert.equal(
          res.issues.some((i) => i.code === "EARTHENWARE_HIGH_FIRE_MELTDOWN"),
          true
        );
      }
    });

    test("MANDATORY: Porcelain + Western Raku / Pit Firing -> Failed (severe thermal shock)", () => {
      for (const method of ["WESTERN_RAKU", "PIT_OPEN"] as FiringMethodId[]) {
        const res = CeramicCompatibilityEngine.evaluate(
          createBaselineInput({
            clayBody: "PORCELAIN",
            surface: { glazeMethod: "NONE" },
            firing: { method },
          })
        );
        assert.equal(res.status, "Failed (Structural/Thermal Failure)");
        assert.equal(
          res.issues.some((i) => i.code === "PORCELAIN_THERMAL_SHOCK_FAILURE"),
          true
        );
      }
    });

    test("MANDATORY: Pit / Raku / Obvara / Horsehair / Saggar ALWAYS set isFoodSafe=false & isWatertight=false", () => {
      const decorativeMethods: FiringMethodId[] = [
        "PIT_OPEN",
        "WESTERN_RAKU",
        "OBVARA",
        "HORSEHAIR_RAKU",
        "SAGGAR",
      ];
      for (const method of decorativeMethods) {
        assert.equal(FIRING_METHOD_CATALOG[method].category, "LOW_FIRE_DECORATIVE");
        const res = CeramicCompatibilityEngine.evaluate(
          createBaselineInput({
            clayBody: "EARTHENWARE",
            surface: {
              surfaceTreatment: "BURNISHING",
              glazeMethod: "NONE",
            },
            firing: { method },
          })
        );
        assert.equal(res.isFoodSafe, false, `${method} must be non-food-safe`);
        assert.equal(res.isWatertight, false, `${method} must be non-watertight`);
      }
    });

    test("MANDATORY: Electric Kiln Host + Salt/Soda or Saggar -> BLOCKED / Failed (destroys Kanthal)", () => {
      for (const method of ["SALT_SODA", "SAGGAR"] as FiringMethodId[]) {
        const res = CeramicCompatibilityEngine.evaluate(
          createBaselineInput({
            clayBody: "STONEWARE",
            surface: { glazeMethod: "NONE" },
            firing: { method, useElectricKilnHost: true },
          })
        );
        assert.equal(res.status, "Failed (Structural/Thermal Failure)");
        assert.equal(
          res.issues.some(
            (i) =>
              i.code === "ELECTRIC_KILN_CORROSIVE_VAPOR_BAN" &&
              i.severity === "BLOCKED"
          ),
          true
        );
      }
    });

    test("Thermal Milestones detect 0-150 C steam explosion, 573 C quartz dunting, and 226 C cristobalite dunting", () => {
      const wetFastFire = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "PORCELAIN",
          shaping: { moistureState: "plastic" },
          firing: {
            method: "ELECTRIC_OXIDATION",
            candlingComplete: false,
            heatingRate: "fast",
            coolingRate: "fast",
          },
        })
      );
      assert.equal(wetFastFire.status, "Failed (Structural/Thermal Failure)");
      const m150 = wetFastFire.thermalMilestones.find(
        (m) => m.id === "WATER_EVAP_150C"
      );
      const m573 = wetFastFire.thermalMilestones.find(
        (m) => m.id === "QUARTZ_INVERSION_573C"
      );
      const m226 = wetFastFire.thermalMilestones.find(
        (m) => m.id === "CRISTOBALITE_COOL_226C"
      );
      assert.equal(m150?.status, "CRITICAL");
      assert.equal(m573?.status, "CRITICAL");
      assert.equal(m226?.status, "CRITICAL");
    });

    test("Paper Clay without burnout ventilation triggers critical safety failure", () => {
      const noVent = CeramicCompatibilityEngine.evaluate(
        createBaselineInput({
          clayBody: "PAPER_CLAY",
          firing: { ventilationActive: false },
        })
      );
      assert.equal(noVent.status, "Failed (Structural/Thermal Failure)");
      assert.equal(
        noVent.issues.some((i) => i.code === "PAPER_CLAY_NO_VENTILATION"),
        true
      );
    });
  });

  describe("FreeformClayField (3D Asymmetric Sculpting: Wiggle, Spout, Asym Dip, Lotus Wave)", () => {
    test("local 3D brush deforms only the touched angle & rim height asymmetrically", () => {
      const field = new FreeformClayField();
      assert.equal(field.hasDeformation(), false);

      // Pull a pouring spout outward + lift rim at angle 0 (front), leave opposite side (PI) untouched
      field.applyLocalBrush(0, 0.9, 18.0, 2.5, 0.45, 0.25);
      assert.equal(field.hasDeformation(), true);

      const frontOffsetCm = field.sampleRadialOffsetCm(0.9, 0);
      const backOffsetCm = field.sampleRadialOffsetCm(0.9, Math.PI);
      const frontRimLiftCm = field.sampleRimHeightOffsetCm(0);
      const backRimLiftCm = field.sampleRimHeightOffsetCm(Math.PI);

      assert.equal(frontOffsetCm > 1.2, true);
      assert.equal(Math.abs(backOffsetCm) < 0.05, true);
      assert.equal(frontRimLiftCm > 1.5, true);
      assert.equal(Math.abs(backRimLiftCm) < 0.05, true);
    });

    test("organic presets (Wiggle Rim, Spout, Asym Dip, Lotus Wave, Smooth) build solid asymmetric 3D meshes", () => {
      const field = new FreeformClayField();
      field.applyWiggleRim();
      const maxH = Math.max(
        field.computeLocalY(12, 1, 0),
        field.computeLocalY(12, 1, Math.PI / 6),
        field.computeLocalY(12, 1, Math.PI / 3)
      );
      const minH = Math.min(
        field.computeLocalY(12, 1, 0),
        field.computeLocalY(12, 1, Math.PI / 6),
        field.computeLocalY(12, 1, Math.PI / 3)
      );
      assert.equal(maxH > minH, true);

      field.reset();
      field.applyAsymmetricDip(0);
      // Dip at angle 0 is lower than opposite crest at PI
      assert.equal(
        field.computeLocalY(12, 1, 0) < field.computeLocalY(12, 1, Math.PI),
        true
      );

      field.reset();
      field.applyLotusWave(5);
      const mesh = LatheMeshGenerator.buildSolidVessel(
        12,
        [45, 70, 85, 77, 85],
        undefined,
        32,
        20,
        "PINCHING",
        "NONE",
        true,
        field
      );
      assert.equal(mesh.triangleCount > 1000, true);
      assert.equal(mesh.vertices.length, mesh.vertexCount * 10);

      const beforePeak = Math.abs(field.sampleRimHeightOffsetCm(Math.PI / 10));
      field.smooth(0.6);
      const afterPeak = Math.abs(field.sampleRimHeightOffsetCm(Math.PI / 10));
      assert.equal(afterPeak < beforePeak, true);
    });
  });
});
