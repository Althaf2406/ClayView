import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-3: Deformation & Multi-Zone Tolerance Feedback (> 4 mm triggers OVER_CORAL)
 * Verifies dragging ClayZoneHandle_Belly outward by 0.6 cm (6 mm) transitions
 * BellyZoneStatusText to "OVER_CORAL" and reduces MatchPercentText below 100%.
 */
@component
export class ShapeDeformationScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const interactor = new DefaultLeafInteractor();
    const bellyHandle = findInteractableByName("ClayZoneHandle_Belly");
    const bellyStatusText = findSceneObjectByName(
      "BellyZoneStatusText"
    ).getComponent("Component.Text") as Text;
    const matchPercentText = findSceneObjectByName(
      "MatchPercentText"
    ).getComponent("Component.Text") as Text;

    expect(bellyHandle).toBeTruthy();

    // Drag outward 6 mm (0.6 cm in world units) over 500 ms
    await interactor.drag(bellyHandle, new vec3(0.6, 0, 0), 500);
    await sleep(150);

    expect(bellyStatusText.text).toBe("OVER_CORAL");
    const parsedMatch = parseInt(matchPercentText.text.replace("%", ""), 10);
    expect(parsedMatch).toBeLessThan(100);
  }
}
