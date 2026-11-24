import { LatheMeshGenerator } from "./LatheMeshGenerator";

export interface ClayDeformationState {
  /** Current per-zone radius offsets in mm relative to target wet radii */
  readonly zoneOffsetsMm: [number, number, number, number, number];
  /** Current actual vessel height in cm */
  readonly actualHeightCm: number;
}

export type HandContactMode = "NONE" | "INSIDE_PUSH" | "OUTSIDE_SQUEEZE" | "TOP_OPEN";

export interface HandContactResult {
  readonly state: ClayDeformationState;
  readonly mode: HandContactMode;
  readonly contactHeightCm: number;
  readonly deformed: boolean;
}

const ZONE_NORMALIZED_Y: readonly number[] = [0.06, 0.28, 0.5, 0.74, 0.96];

/**
 * Pure TypeScript viscoelastic clay throwing physics engine.
 * Models real pottery wheel behavior:
 * 1. Neighbor Coupling: Pushing/pulling one zone smoothly carries adjacent wall zones.
 * 2. Volume Conservation: Squeezing clay walls inward pushes clay UPWARD (taller vessel);
 *    flaring walls outward settles height slightly LOWER; pulling height up draws walls slightly INWARD.
 * 3. Inside vs Outside Hand Sculpting: A hand or virtual sculpting tool entering from the
 *    top opening pushes walls OUTWARD from inside, while pressing from outside squeezes
 *    and collars the clay INWARD (making it rise taller).
 */
export class ClayWheelPhysicsEngine {
  public static readonly MIN_HEIGHT_CM = 6.0;
  public static readonly MAX_HEIGHT_CM = 26.0;
  public static readonly MIN_RADIUS_MM = 15.0;
  public static readonly MAX_OFFSET_MM = 42.0;

  /** Fraction of radial displacement carried to immediate adjacent zones */
  public static readonly NEIGHBOR_COUPLING_1 = 0.28;
  /** Fraction of radial displacement carried to 2-step adjacent zones */
  public static readonly NEIGHBOR_COUPLING_2 = 0.08;
  /**
   * Volume conservation coupling exponent (0 = none, 1 = rigid constant volume).
   * 0.45 models wet stoneware where some clay moves into wall thickness and some into height.
   */
  public static readonly VOLUME_HEIGHT_COUPLING = 0.45;

  /**
   * Computes a normalized cross-sectional area proxy (sum of squared radii in cm^2)
   * proportional to vessel volume / height.
   */
  public static computeCrossSectionAreaProxy(radiiMm: readonly number[]): number {
    let sumSq = 0;
    for (let i = 0; i < radiiMm.length; i++) {
      const rCm = Math.max(1.2, radiiMm[i] / 10.0);
      sumSq += rCm * rCm;
    }
    return sumSq;
  }

  /**
   * Applies radial push/pull at a specific zone index with viscoelastic neighbor coupling
   * and volume-conserving height adjustment.
   */
  public static applyRadialForce(
    targetRadiiMm: readonly number[],
    currentState: ClayDeformationState,
    zoneIndex: number,
    deltaMm: number
  ): ClayDeformationState {
    if (Math.abs(deltaMm) < 1e-4) return currentState;

    const oldRadiiMm = targetRadiiMm.map((r, i) =>
      Math.max(this.MIN_RADIUS_MM, r + currentState.zoneOffsetsMm[i])
    );
    const oldArea = this.computeCrossSectionAreaProxy(oldRadiiMm);

    const nextOffsets: [number, number, number, number, number] = [
      currentState.zoneOffsetsMm[0],
      currentState.zoneOffsetsMm[1],
      currentState.zoneOffsetsMm[2],
      currentState.zoneOffsetsMm[3],
      currentState.zoneOffsetsMm[4],
    ];

    for (let i = 0; i < 5; i++) {
      const dist = Math.abs(i - zoneIndex);
      let weight = 0;
      if (dist === 0) weight = 1.0;
      else if (dist === 1) weight = this.NEIGHBOR_COUPLING_1;
      else if (dist === 2) weight = this.NEIGHBOR_COUPLING_2;

      if (weight > 0) {
        const rawOffset = nextOffsets[i] + deltaMm * weight;
        const minOffset = this.MIN_RADIUS_MM - targetRadiiMm[i];
        const clamped = Math.max(
          Math.max(-this.MAX_OFFSET_MM, minOffset),
          Math.min(this.MAX_OFFSET_MM, rawOffset)
        );
        nextOffsets[i] = Math.round(clamped * 100) / 100;
      }
    }

    const newRadiiMm = targetRadiiMm.map((r, i) =>
      Math.max(this.MIN_RADIUS_MM, r + nextOffsets[i])
    );
    const newArea = this.computeCrossSectionAreaProxy(newRadiiMm);

    // Volume conservation: squeezing inward (newArea < oldArea) pushes clay UPWARD!
    let nextHeight = currentState.actualHeightCm;
    if (oldArea > 1e-4 && newArea > 1e-4) {
      const areaRatio = oldArea / newArea;
      const heightFactor = Math.pow(areaRatio, this.VOLUME_HEIGHT_COUPLING);
      nextHeight = Math.max(
        this.MIN_HEIGHT_CM,
        Math.min(this.MAX_HEIGHT_CM, currentState.actualHeightCm * heightFactor)
      );
      nextHeight = Math.round(nextHeight * 100) / 100;
    }

    return {
      zoneOffsetsMm: nextOffsets,
      actualHeightCm: nextHeight,
    };
  }

  /**
   * Applies vertical pulling/compressing force on vessel height with volume-conserving
   * radial thinning (pulling up narrows walls slightly; pressing down widens belly slightly).
   */
  public static applyVerticalForce(
    targetRadiiMm: readonly number[],
    currentState: ClayDeformationState,
    deltaHeightCm: number
  ): ClayDeformationState {
    if (Math.abs(deltaHeightCm) < 1e-4) return currentState;

    const oldHeight = currentState.actualHeightCm;
    const nextHeight = Math.round(
      Math.max(
        this.MIN_HEIGHT_CM,
        Math.min(this.MAX_HEIGHT_CM, oldHeight + deltaHeightCm)
      ) * 100
    ) / 100;

    if (Math.abs(nextHeight - oldHeight) < 1e-4) return currentState;

    // Pulling clay taller (nextHeight > oldHeight) gently draws upper/mid walls inward;
    // pressing down gently flares mid/belly outward.
    const heightRatio = oldHeight / nextHeight;
    const radialScale = Math.pow(heightRatio, this.VOLUME_HEIGHT_COUPLING * 0.45);

    // Base (zone 0) stays anchored to the wheel bat more firmly than belly/shoulder/rim
    const mobilityWeights = [0.2, 0.75, 1.0, 0.95, 0.85];
    const nextOffsets: [number, number, number, number, number] = [
      currentState.zoneOffsetsMm[0],
      currentState.zoneOffsetsMm[1],
      currentState.zoneOffsetsMm[2],
      currentState.zoneOffsetsMm[3],
      currentState.zoneOffsetsMm[4],
    ];

    for (let i = 0; i < 5; i++) {
      const curR = Math.max(
        this.MIN_RADIUS_MM,
        targetRadiiMm[i] + currentState.zoneOffsetsMm[i]
      );
      const desiredR = curR * radialScale;
      const deltaR = (desiredR - curR) * mobilityWeights[i];
      const rawOffset = currentState.zoneOffsetsMm[i] + deltaR;
      const minOffset = this.MIN_RADIUS_MM - targetRadiiMm[i];
      const clamped = Math.max(
        Math.max(-this.MAX_OFFSET_MM, minOffset),
        Math.min(this.MAX_OFFSET_MM, rawOffset)
      );
      nextOffsets[i] = Math.round(clamped * 100) / 100;
    }

    return {
      zoneOffsetsMm: nextOffsets,
      actualHeightCm: nextHeight,
    };
  }

  /**
   * Evaluates 3D cylindrical contact of a potter's hand (or virtual PotterHandTool)
   * in WheelCenterAnchor local coordinates (cm) against the spinning clay wall:
   * - Reaching INSIDE from the top (`r < wallRadius`) and moving outward pushes the clay wall OUTWARD.
   * - Reaching INSIDE near the top center and pressing downward opens/flares the cavity.
   * - Pressing from OUTSIDE (`r` near `outerWallRadius`) squeezes the clay wall INWARD (raising height!).
   * - Moving UPWARD while touching the clay wall pulls the clay TALLER!
   */
  public static applyHandToolContact(
    targetRadiiMm: readonly number[],
    currentState: ClayDeformationState,
    localPosCm: { readonly x: number; readonly y: number; readonly z: number },
    localVelCm: { readonly x: number; readonly y: number; readonly z: number },
    toolRadiusCm: number = 1.4
  ): HandContactResult {
    const h = currentState.actualHeightCm;

    // Outside vertical bounds of the spinning vessel
    if (localPosCm.y < -0.5 || localPosCm.y > h + 2.0) {
      return {
        state: currentState,
        mode: "NONE",
        contactHeightCm: Math.max(0, Math.min(h, localPosCm.y)),
        deformed: false,
      };
    }

    const rHandCm = Math.sqrt(
      localPosCm.x * localPosCm.x + localPosCm.z * localPosCm.z
    );
    const t = Math.max(0, Math.min(1, localPosCm.y / Math.max(1.0, h)));

    const actualRadiiMm = targetRadiiMm.map((r, i) =>
      Math.max(this.MIN_RADIUS_MM, r + currentState.zoneOffsetsMm[i])
    );
    const wallRadiusCm = LatheMeshGenerator.interpolateRadiusCm(actualRadiiMm, t);

    // Find closest zone index to contact height t
    let closestZone = 0;
    let bestDist = 999;
    for (let i = 0; i < ZONE_NORMALIZED_Y.length; i++) {
      const d = Math.abs(ZONE_NORMALIZED_Y[i] - t);
      if (d < bestDist) {
        bestDist = d;
        closestZone = i;
      }
    }

    // Radial velocity component (positive = moving away from center axis, negative = squeezing inward)
    let radialVelCm = 0;
    if (rHandCm > 0.15) {
      radialVelCm =
        (localPosCm.x * localVelCm.x + localPosCm.z * localVelCm.z) / rHandCm;
    }

    let nextState = currentState;
    let mode: HandContactMode = "NONE";
    let deformed = false;

    const innerWallCm = Math.max(0.8, wallRadiusCm - 0.65);

    // 1. TOP OPENING / PRESSING DOWN INTO THE HOLLOW CENTER FROM ABOVE
    if (
      localPosCm.y >= h - 2.2 &&
      localPosCm.y <= h + 1.8 &&
      rHandCm < innerWallCm * 0.72 &&
      localVelCm.y < -0.02
    ) {
      mode = "TOP_OPEN";
      // Pressing down inside opens the rim/shoulder outward and slightly compresses height
      nextState = this.applyVerticalForce(
        targetRadiiMm,
        nextState,
        localVelCm.y * 0.45
      );
      nextState = this.applyRadialForce(
        targetRadiiMm,
        nextState,
        4,
        Math.abs(localVelCm.y) * 5.0
      );
      deformed = true;
    }
    // 2. INSIDE THE POT: Hand/tool inside the hollow cavity pushing OUTWARD against inner wall
    else if (rHandCm < wallRadiusCm - 0.25 && localPosCm.y <= h + 0.5) {
      const penetrationCm = rHandCm + toolRadiusCm - innerWallCm;
      if (penetrationCm > 0 && radialVelCm > -0.05) {
        mode = "INSIDE_PUSH";
        // Push wall outward based on outward penetration & outward hand motion
        const pushMm = Math.min(
          6.0,
          Math.max(0, penetrationCm * 2.8 + Math.max(0, radialVelCm) * 6.0)
        );
        if (pushMm > 0.08) {
          nextState = this.applyRadialForce(
            targetRadiiMm,
            nextState,
            closestZone,
            pushMm
          );
          deformed = true;
        }
        // Lifting upward while pressing inner wall also pulls clay taller!
        if (localVelCm.y > 0.02) {
          nextState = this.applyVerticalForce(
            targetRadiiMm,
            nextState,
            localVelCm.y * 0.55
          );
          deformed = true;
        }
      } else if (rHandCm < innerWallCm && Math.abs(localVelCm.y) > 0.02) {
        // Inside cavity, subtle contact indication even before hitting wall
        mode = "INSIDE_PUSH";
      }
    }
    // 3. OUTSIDE THE POT: Hand/tool pressing INWARD from outside the wall
    else if (
      rHandCm >= wallRadiusCm - 0.25 &&
      rHandCm <= wallRadiusCm + toolRadiusCm + 1.2 &&
      localPosCm.y <= h + 0.6
    ) {
      const overlapCm = wallRadiusCm + toolRadiusCm - rHandCm;
      if (overlapCm > 0) {
        mode = "OUTSIDE_SQUEEZE";
        // Pressing inward squeezes clay inward -> volume conservation pushes vessel TALLER!
        if (radialVelCm < 0.05) {
          const squeezeMm = Math.min(
            6.0,
            Math.max(0, overlapCm * 2.6 + Math.max(0, -radialVelCm) * 6.0)
          );
          if (squeezeMm > 0.08) {
            nextState = this.applyRadialForce(
              targetRadiiMm,
              nextState,
              closestZone,
              -squeezeMm
            );
            deformed = true;
          }
        }
        // Moving hand upward/downward along the outer wall pulls clay up or compresses down!
        if (Math.abs(localVelCm.y) > 0.02) {
          nextState = this.applyVerticalForce(
            targetRadiiMm,
            nextState,
            localVelCm.y * 0.65
          );
          deformed = true;
        }
      }
    }

    return {
      state: nextState,
      mode,
      contactHeightCm: Math.max(0, Math.min(nextState.actualHeightCm, localPosCm.y)),
      deformed,
    };
  }
}
