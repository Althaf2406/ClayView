import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import {
  findSceneObjectByName,
  nextFrame,
  sleep,
} from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-5: Offscreen Gaze Navigation (> 16.0 degrees away from WheelCenterAnchor)
 * Verifies rotating MainCamera 45 degrees away from WheelCenterAnchor enables
 * EdgeOfScreenArrow (true).
 */
@component
export class OffscreenNavigationScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const mainCamera =
      findSceneObjectByName("MainCamera") ||
      findSceneObjectByName("Camera Object");
    const edgeArrow = findSceneObjectByName("EdgeOfScreenArrow");

    expect(mainCamera).toBeTruthy();
    expect(edgeArrow).toBeTruthy();

    const deviceTracking = mainCamera.getComponent(
      "Component.DeviceTracking"
    ) as DeviceTracking | null;
    if (deviceTracking) {
      deviceTracking.enabled = false;
    }

    // Rotate camera 45 degrees away from WheelCenterAnchor
    mainCamera
      .getTransform()
      .setWorldRotation(quat.fromEulerAngles(0, -45 * (Math.PI / 180), 0));
    await nextFrame();
    await sleep(100);

    expect(edgeArrow.enabled).toBe(true);

    // Restore rotation and DeviceTracking
    mainCamera.getTransform().setWorldRotation(quat.quatIdentity());
    await nextFrame();

    if (deviceTracking) {
      deviceTracking.enabled = true;
    }
  }
}
