import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-2: Kiln Shrinkage Recalibration (12% Stoneware -> 14% Porcelain)
 * Verifies triggering ShrinkageCycleBtn updates TargetHeightText from "18.18 cm"
 * to "18.60 cm" and ShrinkageBadgeText to "14% PORCELAIN".
 */
@component
export class ShrinkageCycleScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const interactor = new DefaultLeafInteractor();
    const cycleBtn = findInteractableByName("ShrinkageCycleBtn");
    const targetHeightText = findSceneObjectByName(
      "TargetHeightText"
    ).getComponent("Component.Text") as Text;
    const shrinkageBadgeText = findSceneObjectByName(
      "ShrinkageBadgeText"
    ).getComponent("Component.Text") as Text;

    expect(cycleBtn).toBeTruthy();
    expect(targetHeightText.text).toBe("18.18 cm");

    await interactor.trigger(cycleBtn);
    await sleep(150);

    expect(targetHeightText.text).toBe("18.60 cm");
    expect(shrinkageBadgeText.text).toBe("14% PORCELAIN");
  }
}
