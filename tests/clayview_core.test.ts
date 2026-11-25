import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  KilnShrinkageEngine,
  FiredVesselSpec,
} from "../Assets/Scripts/Core/KilnShrinkageEngine";
import {
  ProfileDeltaEvaluator,
} from "../Assets/Scripts/Core/ProfileDeltaEvaluator";
import {
  SeriesConsistencyTracker,
} from "../Assets/Scripts/Core/SeriesConsistencyTracker";
import {
  FovNavigationMath,
} from "../Assets/Scripts/Core/FovNavigationMath";
import {
  LatheMeshGenerator,
} from "../Assets/Scripts/Core/LatheMeshGenerator";
import {
  ClayWheelPhysicsEngine,
} from "../Assets/Scripts/Core/ClayWheelPhysicsEngine";
import {
  ClayStudioFlowEngine,
} from "../Assets/Scripts/Core/ClayStudioFlowEngine";

describe("ClayView - Pure TypeScript Core Engine", () => {
  describe("KilnShrinkageEngine", () => {
    test("calculates wet dimensions accurately for all presets", () => {
      // 0% Stoneware
      const wet0 = KilnShrinkageEngine.calculateWetDimension(16.0, "STONEWARE_0");
      assert.equal(wet0.toFixed(2), "16.00");

      // 10% Low-Fire
      const wet10 = KilnShrinkageEngine.calculateWetDimension(16.0, "LOW_FIRE_10");
      assert.equal(wet10.toFixed(2), "17.78");

      // 12% Stoneware
      const wet12 = KilnShrinkageEngine.calculateWetDimension(16.0, "STONEWARE_12");
      assert.equal(wet12.toFixed(2), "18.18");

      // 14% Porcelain
      const wet14 = KilnShrinkageEngine.calculateWetDimension(16.0, "PORCELAIN_14");
      assert.equal(wet14.toFixed(2), "18.60");
    });

    test("computes complete wet vessel target from fired spec", () => {
      const spec: FiredVesselSpec = {
        presetName: "Classic Bowl",
        firedHeightCm: 16.0,
        zoneFiredRadiiMm: [40, 65, 75, 70, 75],
      };

      const targetPorcelain = KilnShrinkageEngine.computeWetTarget(
        spec,
        "PORCELAIN_14"
      );
      assert.equal(targetPorcelain.clayType, "PORCELAIN_14");
      assert.equal(targetPorcelain.shrinkRate, 0.14);
      assert.equal(targetPorcelain.wetHeightCm.toFixed(2), "18.60");
      assert.equal(targetPorcelain.wetRadiiMm[0].toFixed(2), "46.51"); // 40 / 0.86
      assert.equal(targetPorcelain.wetRadiiMm[2].toFixed(2), "87.21"); // 75 / 0.86
    });

    test("cycles correctly through clay presets", () => {
      assert.equal(KilnShrinkageEngine.nextClayType("STONEWARE_0"), "LOW_FIRE_10");
      assert.equal(KilnShrinkageEngine.nextClayType("LOW_FIRE_10"), "STONEWARE_12");
      assert.equal(KilnShrinkageEngine.nextClayType("STONEWARE_12"), "PORCELAIN_14");
      assert.equal(KilnShrinkageEngine.nextClayType("PORCELAIN_14"), "STONEWARE_0");
    });

    test("cycles through all 4 ceramic vessel presets", () => {
      assert.equal(KilnShrinkageEngine.getPresetCount(), 4);
      assert.equal(KilnShrinkageEngine.getPreset(0).presetName, "Cylinder Vase");
      assert.equal(KilnShrinkageEngine.getPreset(0).firedHeightCm, 16.0);
      assert.equal(KilnShrinkageEngine.getPreset(1).presetName, "Tea Bowl");
      assert.equal(KilnShrinkageEngine.getPreset(2).presetName, "Amphora");
      assert.equal(KilnShrinkageEngine.getPreset(3).presetName, "Studio Mug");
      assert.equal(KilnShrinkageEngine.nextPresetIndex(3), 0);
    });

    test("rejects negative dimensions and invalid rates", () => {
      assert.throws(() => KilnShrinkageEngine.calculateWetDimension(-10, "PORCELAIN_14"));
      assert.throws(() => KilnShrinkageEngine.calculateWetDimension(10, 1.0));
      assert.throws(() => KilnShrinkageEngine.calculateWetDimension(10, -0.1));
    });
  });

  describe("ProfileDeltaEvaluator", () => {
    test("categorizes tolerance status according to 2mm and 4mm thresholds", () => {
      // MATCH_TEAL: <= 2.0 mm
      const evalTeal = ProfileDeltaEvaluator.evaluateZone(70.0, 71.5, 2);
      assert.equal(evalTeal.status, "MATCH_TEAL");
      assert.equal(evalTeal.absDeltaMm, 1.5);
      assert.equal(evalTeal.zoneName, "Belly");

      // WARN_AMBER: > 2.0 mm and <= 4.0 mm
      const evalAmber = ProfileDeltaEvaluator.evaluateZone(70.0, 73.2, 2);
      assert.equal(evalAmber.status, "WARN_AMBER");
      assert.equal(evalAmber.absDeltaMm, 3.2);

      // OVER_CORAL: > 4.0 mm (actual > target)
      const evalOverCoral = ProfileDeltaEvaluator.evaluateZone(70.0, 75.0, 2);
      assert.equal(evalOverCoral.status, "OVER_CORAL");
      assert.equal(evalOverCoral.absDeltaMm, 5.0);

      // UNDER_CORAL: > 4.0 mm (actual < target)
      const evalUnderCoral = ProfileDeltaEvaluator.evaluateZone(70.0, 64.0, 2);
      assert.equal(evalUnderCoral.status, "UNDER_CORAL");
      assert.equal(evalUnderCoral.absDeltaMm, 6.0);
    });

    test("evaluates complete 5-zone profile summary", () => {
      const targetRadii = [45.0, 70.0, 85.0, 75.0, 80.0];
      const perfectActual = [45.5, 70.8, 86.0, 74.2, 80.1]; // All <= 1.0 mm

      const perfectSummary = ProfileDeltaEvaluator.evaluateProfile(
        targetRadii,
        perfectActual
      );
      assert.equal(perfectSummary.allZonesStable, true);
      assert.equal(perfectSummary.matchPercentage, 100);
      assert.equal(perfectSummary.maxDeviationMm, 1.0);

      const mixedActual = [45.0, 73.0, 91.0, 75.0, 80.0]; // Zone 1 Amber (+3), Zone 2 Coral (+6)
      const mixedSummary = ProfileDeltaEvaluator.evaluateProfile(
        targetRadii,
        mixedActual
      );
      assert.equal(mixedSummary.allZonesStable, false);
      assert.equal(mixedSummary.maxDeviationMm, 6.0);
      // (100 + 70 + 30 + 100 + 100) / 5 = 400 / 5 = 80%
      assert.equal(mixedSummary.matchPercentage, 80);
    });

    test("throws if zone count is not exactly 5", () => {
      assert.throws(() =>
        ProfileDeltaEvaluator.evaluateProfile([10, 20], [10, 20])
      );
    });
  });

  describe("SeriesConsistencyTracker", () => {
    test("tracks pieces and calculates running averages", () => {
      const tracker = new SeriesConsistencyTracker(6);
      assert.equal(tracker.getCurrentPieceNumber(), 1);
      assert.equal(tracker.getCounterLabel(), "Piece 1 of 6");
      assert.equal(tracker.getSavedCount(), 0);
      assert.equal(tracker.getAverageMatchPercentage(), 0);

      // Save piece 1
      tracker.recordPiece(94, 1.8, "PORCELAIN_14", 1000);
      assert.equal(tracker.getSavedCount(), 1);
      assert.equal(tracker.getCurrentPieceNumber(), 2);
      assert.equal(tracker.getCounterLabel(), "Piece 2 of 6");
      assert.equal(tracker.getAverageMatchPercentage(), 94);

      // Save piece 2
      tracker.recordPiece(86, 3.2, "PORCELAIN_14", 2000);
      assert.equal(tracker.getSavedCount(), 2);
      assert.equal(tracker.getAverageMatchPercentage(), 90); // (94 + 86)/2 = 90

      const history = tracker.getHistory();
      assert.equal(history.length, 2);
      assert.equal(history[0].pieceNumber, 1);
      assert.equal(history[1].pieceNumber, 2);
    });
  });

  describe("FovNavigationMath", () => {
    test("detects off-screen status when gaze deviates beyond 16 degrees horizontally", () => {
      const camPos = { x: 0, y: 0, z: 0 };
      const wheelPos = { x: 0, y: -26, z: -55 };

      // Looking straight ahead along -Z (identity camera rotation): horizontal offset = 0 deg
      const identityEval = FovNavigationMath.evaluateGazeOffset(
        camPos,
        { x: 0, y: 0, z: -1 },
        wheelPos
      );
      assert.equal(identityEval.horizontalAngleDeg, 0);
      assert.equal(identityEval.isOffscreen, false);

      // Looking directly toward the wheel center: 0 degree offset
      const centeredEval = FovNavigationMath.evaluateGazeOffset(
        camPos,
        { x: 0, y: -26, z: -55 },
        wheelPos
      );
      assert.equal(centeredEval.angleDeg, 0);
      assert.equal(centeredEval.isOffscreen, false);

      // Looking 45 degrees sideways: exceeds 16.0 degree threshold
      const rotatedEval = FovNavigationMath.evaluateGazeOffset(
        camPos,
        { x: -0.7071, y: 0, z: -0.7071 },
        wheelPos
      );
      assert.equal(rotatedEval.isOffscreen, true);
      assert.equal(rotatedEval.horizontalAngleDeg > 16.0, true);
    });
  });

  describe("LatheMeshGenerator", () => {
    test("generates 16 ribs and 6 contour rings for MeshTopology.Lines", () => {
      const geom = LatheMeshGenerator.buildWireframe(
        18.18,
        [45.45, 70.45, 85.23, 77.27, 85.23]
      );
      // 6 rings * 16 ribs = 96 vertices
      assert.equal(geom.vertexCount, 96);
      assert.equal(geom.vertices.length, 96 * 7);
      // Horizontal segments: 6 * 16 = 96; Vertical segments: 16 * 5 = 80; Total = 176 line segments
      assert.equal(geom.lineSegmentCount, 176);
      assert.equal(geom.indices.length, 176 * 2);
    });

    test("generates caliper gauge, solid spinning clay vessel, and wheel bat meshes", () => {
      const caliper = LatheMeshGenerator.buildCaliperGauge(18.18);
      assert.equal(caliper.lineSegmentCount, 6);

      const vessel = LatheMeshGenerator.buildSolidVessel(
        18.18,
        [45.45, 70.45, 85.23, 77.27, 85.23]
      );
      assert.equal(vessel.triangleCount > 0, true);
      assert.equal(vessel.vertices.length, vessel.vertexCount * 10);

      const bat = LatheMeshGenerator.buildWheelBat(12.0, 1.2, 32);
      assert.equal(bat.triangleCount, 32 + 64);
      assert.equal(bat.vertices.length, bat.vertexCount * 10);
    });
  });

  describe("ClayWheelPhysicsEngine", () => {
    const targetRadiiMm = [45.45, 70.45, 85.23, 77.27, 85.23];

    test("conserves clay volume: squeezing inward raises height & couples neighbors", () => {
      const initial = {
        zoneOffsetsMm: [0, 0, 0, 0, 0] as [number, number, number, number, number],
        actualHeightCm: 18.18,
      };

      // Squeeze belly inward by -12 mm
      const squeezed = ClayWheelPhysicsEngine.applyRadialForce(
        targetRadiiMm,
        initial,
        2,
        -12.0
      );

      // Belly narrows, neighbors (LowerBelly & Shoulder) couple inward smoothly
      assert.equal(squeezed.zoneOffsetsMm[2], -12.0);
      assert.equal(squeezed.zoneOffsetsMm[1] < 0, true);
      assert.equal(squeezed.zoneOffsetsMm[3] < 0, true);
      // Displaced clay forces vessel TALLER!
      assert.equal(squeezed.actualHeightCm > initial.actualHeightCm, true);
    });

    test("conserves clay volume: widening outward settles height lower", () => {
      const initial = {
        zoneOffsetsMm: [0, 0, 0, 0, 0] as [number, number, number, number, number],
        actualHeightCm: 18.18,
      };

      const widened = ClayWheelPhysicsEngine.applyRadialForce(
        targetRadiiMm,
        initial,
        2,
        12.0
      );

      assert.equal(widened.zoneOffsetsMm[2], 12.0);
      assert.equal(widened.zoneOffsetsMm[1] > 0, true);
      assert.equal(widened.actualHeightCm < initial.actualHeightCm, true);
    });

    test("pulling height upward draws walls gently inward", () => {
      const initial = {
        zoneOffsetsMm: [0, 0, 0, 0, 0] as [number, number, number, number, number],
        actualHeightCm: 18.18,
      };

      const pulled = ClayWheelPhysicsEngine.applyVerticalForce(
        targetRadiiMm,
        initial,
        3.5
      );

      assert.equal(pulled.actualHeightCm > 21.0, true);
      assert.equal(pulled.zoneOffsetsMm[2] < 0, true);
    });

    test("hand entering from top inside pushes wall outward; outside hand squeezes inward", () => {
      const initial = {
        zoneOffsetsMm: [0, 0, 0, 0, 0] as [number, number, number, number, number],
        actualHeightCm: 18.18,
      };

      // Hand inside belly cavity (r = 7.4 cm < wall 8.52 cm) pushing outward (+X)
      const insideRes = ClayWheelPhysicsEngine.applyHandToolContact(
        targetRadiiMm,
        initial,
        { x: 7.4, y: 9.0, z: 0 },
        { x: 0.4, y: 0, z: 0 }
      );
      assert.equal(insideRes.mode, "INSIDE_PUSH");
      assert.equal(insideRes.deformed, true);
      assert.equal(insideRes.state.zoneOffsetsMm[2] > 0, true);

      // Hand outside belly wall (r = 9.0 cm > wall 8.52 cm) squeezing inward (-X)
      const outsideRes = ClayWheelPhysicsEngine.applyHandToolContact(
        targetRadiiMm,
        initial,
        { x: 9.0, y: 9.0, z: 0 },
        { x: -0.4, y: 0.1, z: 0 }
      );
      assert.equal(outsideRes.mode, "OUTSIDE_SQUEEZE");
      assert.equal(outsideRes.deformed, true);
      assert.equal(outsideRes.state.zoneOffsetsMm[2] < 0, true);
      assert.equal(outsideRes.state.actualHeightCm > initial.actualHeightCm, true);
    });
  });

  describe("ClayStudioFlowEngine", () => {
    const targetRadiiMm = [45.45, 70.45, 85.23, 77.27, 85.23];

    test("builds raw Globe Piece clay mound scaled by selected clay mass", () => {
      const small = ClayStudioFlowEngine.buildGlobePieceState(
        targetRadiiMm,
        "SMALL_450G"
      );
      const med = ClayStudioFlowEngine.buildGlobePieceState(
        targetRadiiMm,
        "MEDIUM_900G"
      );
      const large = ClayStudioFlowEngine.buildGlobePieceState(
        targetRadiiMm,
        "LARGE_1500G"
      );

      assert.equal(small.actualHeightCm < med.actualHeightCm, true);
      assert.equal(med.actualHeightCm < large.actualHeightCm, true);
      // Medium 900g globe belly starts right near target belly (<= 2mm) while rim starts closed (< target rim)
      assert.equal(Math.abs(med.zoneOffsetsMm[2]) <= 2.0, true);
      assert.equal(med.zoneOffsetsMm[4] < -40.0, true);
    });

    test("computes 360-degree orbital camera-facing basis around wheel anchor", () => {
      const anchor = { x: 0, z: -55 };

      // Camera at origin (0, 0): right vector is +X, yaw = 0
      const frontBasis = ClayStudioFlowEngine.computeOrbitalBasis(anchor, {
        x: 0,
        z: 0,
      });
      assert.equal(frontBasis.toCamX, 0);
      assert.equal(frontBasis.toCamZ, 1);
      assert.equal(frontBasis.rightX, 1);
      assert.equal(frontBasis.rightZ, 0);
      assert.equal(frontBasis.yawRad, 0);

      // Camera walked to right side (+55, -55): toCam is +X, user's right is -Z, yaw = +90 deg
      const sideBasis = ClayStudioFlowEngine.computeOrbitalBasis(anchor, {
        x: 55,
        z: -55,
      });
      assert.equal(Math.round(sideBasis.toCamX), 1);
      assert.equal(Math.round(sideBasis.toCamZ), 0);
      assert.equal(Math.round(sideBasis.rightX), 0);
      assert.equal(Math.round(sideBasis.rightZ), -1);
      assert.equal(Math.abs(sideBasis.yawRad - Math.PI / 2) < 0.01, true);
    });
  });
});
