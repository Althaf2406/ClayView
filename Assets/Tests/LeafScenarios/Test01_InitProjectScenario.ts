import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-1: Scene Anchoring & Scale Precision
 * Verifies WheelCenterAnchor at (0, -26, -55) cm, GhostProfileMesh enabled,
 * and TargetHeightText reading "18.18 cm" (16.0 cm fired at 12% stoneware shrinkage).
 */
@component
export class InitProjectScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const anchor = findSceneObjectByName("WheelCenterAnchor");
    const ghostMesh = findSceneObjectByName("GhostProfileMesh");
    const targetHeightObj = findSceneObjectByName("TargetHeightText");

    expect(anchor).toBeTruthy();
    expect(ghostMesh).toBeTruthy();
    expect(targetHeightObj).toBeTruthy();

    const anchorPos = anchor.getTransform().getWorldPosition();
    expect(anchorPos.z).toBeGreaterThan(-60);
    expect(anchorPos.z).toBeLessThan(-50);
    expect(anchorPos.y).toBeCloseTo(-26.0, 1);

    expect(ghostMesh.enabled).toBe(true);

    const targetHeightText = targetHeightObj.getComponent(
      "Component.Text"
    ) as Text;
    expect(targetHeightText.text).toBe("18.18 cm");
  }
}
