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
});
