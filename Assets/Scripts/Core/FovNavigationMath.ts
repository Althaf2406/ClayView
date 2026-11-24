export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OffscreenEvaluation {
  readonly angleDeg: number;
  readonly horizontalAngleDeg: number;
  readonly isOffscreen: boolean;
  readonly directionX: number;
  readonly directionY: number;
}

/**
 * Pure TypeScript FOV and Off-Screen Navigation Math for ClayView.
 * Evaluates whether the pottery wheel anchor (WheelCenterAnchor at (0, -26, -55) cm)
 * has exited the comfortable central frustum (> 16.0 degrees horizontal yaw offset
 * or extreme vertical pitch offset away from the wheel gaze line).
 */
export class FovNavigationMath {
  public static readonly OFFSCREEN_THRESHOLD_DEG = 16.0;
  public static readonly VERTICAL_OFFSCREEN_THRESHOLD_DEG = 32.0;

  /**
   * Computes the horizontal (yaw) and 3D gaze angle between the camera's forward look
   * direction and the target anchor relative to the camera position.
   * Because the user's neutral head orientation looks horizontally along -Z while
   * the wheel sits 25.3 deg below eye level, horizontal azimuth deviation > 16.0 deg
   * (or vertical pitch deviation > 32.0 deg) accurately determines when the wheel leaves
   * the 37x32 deg SPECS frustum without false-triggering at identity camera rotation.
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
        horizontalAngleDeg: 0,
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

    const dot3D = Math.max(-1.0, Math.min(1.0, nx * fx + ny * fy + nz * fz));
    const angle3DDeg =
      Math.round(((Math.acos(dot3D) * 180.0) / Math.PI) * 100) / 100;

    // Horizontal (XZ plane) azimuth deviation
    const horizTargetLen = Math.sqrt(dx * dx + dz * dz);
    const horizFwdLen = Math.sqrt(fx * fx + fz * fz);
    let horizontalAngleDeg = angle3DDeg;
    if (horizTargetLen > 1e-6 && horizFwdLen > 1e-6) {
      const hDot = Math.max(
        -1.0,
        Math.min(
          1.0,
          (dx / horizTargetLen) * (fx / horizFwdLen) +
            (dz / horizTargetLen) * (fz / horizFwdLen)
        )
      );
      horizontalAngleDeg =
        Math.round(((Math.acos(hDot) * 180.0) / Math.PI) * 100) / 100;
    }

    const verticalDiffDeg =
      Math.round((Math.abs(Math.asin(ny) - Math.asin(fy)) * 180.0) / Math.PI * 100) / 100;

    const isOffscreen =
      horizontalAngleDeg > thresholdDeg ||
      verticalDiffDeg > FovNavigationMath.VERTICAL_OFFSCREEN_THRESHOLD_DEG;

    return {
      angleDeg: angle3DDeg,
      horizontalAngleDeg,
      isOffscreen,
      directionX: Math.round((nx - fx) * 100) / 100,
      directionY: Math.round((ny - fy) * 100) / 100,
    };
  }
}
