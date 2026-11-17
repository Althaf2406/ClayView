export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OffscreenEvaluation {
  readonly angleDeg: number;
  readonly isOffscreen: boolean;
  readonly directionX: number;
  readonly directionY: number;
}

/**
 * Pure TypeScript FOV and Off-Screen Navigation Math for ClayView.
 * Evaluates whether the pottery wheel anchor (WheelCenterAnchor) has exited
 * the comfortable central frustum (> 16.0 degrees off-axis from camera gaze).
 */
export class FovNavigationMath {
  public static readonly OFFSCREEN_THRESHOLD_DEG = 16.0;

  /**
   * Computes the angle in degrees between the camera's forward look vector
   * and the target anchor position relative to the camera eye position.
   */
  public static evaluateGazeOffset(
    cameraPos: Vec3Like,
    cameraForward: Vec3Like,
    targetPos: Vec3Like,
    thresholdDeg: number = FovNavigationMath.OFFSCREEN_THRESHOLD_DEG
  ): OffscreenEvaluation {
    const dx = targetPos.x - cameraPos.x;
    const dy = targetPos.y - cameraPos.y;
    const dz = targetPos.z - cameraPos.z;

    const toTargetLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const fwdLen = Math.sqrt(
      cameraForward.x * cameraForward.x +
        cameraForward.y * cameraForward.y +
        cameraForward.z * cameraForward.z
    );

    if (toTargetLen < 1e-6 || fwdLen < 1e-6) {
      return {
        angleDeg: 0,
        isOffscreen: false,
        directionX: 0,
        directionY: 0,
      };
    }

    const nx = dx / toTargetLen;
    const ny = dy / toTargetLen;
    const nz = dz / toTargetLen;

    const fx = cameraForward.x / fwdLen;
    const fy = cameraForward.y / fwdLen;
    const fz = cameraForward.z / fwdLen;

    const dot = Math.max(-1.0, Math.min(1.0, nx * fx + ny * fy + nz * fz));
    const angleRad = Math.acos(dot);
    const angleDeg = Math.round(((angleRad * 180.0) / Math.PI) * 100) / 100;

    return {
      angleDeg,
      isOffscreen: angleDeg > thresholdDeg,
      directionX: Math.round((nx - fx) * 100) / 100,
      directionY: Math.round((ny - fy) * 100) / 100,
    };
  }
}
