import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-4: Guided 3-Step Pottery Flow & Clay Mass Selection
 * Verifies StageActionBtn advances Detect Table -> Select Clay -> Throw Clay
 * and ClayMassBtn resizes the Globe Piece from 900g to 1.5kg.
 */
@component
export class SeriesManagementScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const interactor = new DefaultLeafInteractor();
    const stageBtn = findInteractableByName("StageActionBtn");
    const massBtn = findInteractableByName("ClayMassBtn");
    const stageBadgeText = findSceneObjectByName(
      "StageBadgeText"
    ).getComponent("Component.Text") as Text;
    const actualHeightText = findSceneObjectByName(
      "ActualHeightText"
    ).getComponent("Component.Text") as Text;

    expect(stageBtn).toBeTruthy();
    expect(massBtn).toBeTruthy();
    expect(stageBadgeText.text).toBe("STEP 1/3 · DETECT TABLE");

    // Step 1 -> Step 2 (Lock Table)
    await interactor.trigger(stageBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 2/3 · SELECT CLAY");

    // Cycle Clay Mass 900g (10.40 cm) -> 1.5kg (14.50 cm)
    await interactor.trigger(massBtn);
    await sleep(150);
    expect(actualHeightText.text.includes("14.50")).toBe(true);

    // Step 2 -> Step 3 (Start Throwing)
    await interactor.trigger(stageBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 3/3 · THROW CLAY");
  }
}
