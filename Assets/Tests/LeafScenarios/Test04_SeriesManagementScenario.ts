import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-4: Series Consistency & History Logging (SavePieceBtn / "next piece")
 * Verifies triggering SavePieceBtn advances PieceCounterText from "Piece 1 of 6"
 * to "Piece 2 of 6".
 */
@component
export class SeriesManagementScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const interactor = new DefaultLeafInteractor();
    const saveBtn = findInteractableByName("SavePieceBtn");
    const pieceCounterText = findSceneObjectByName(
      "PieceCounterText"
    ).getComponent("Component.Text") as Text;

    expect(saveBtn).toBeTruthy();
    expect(pieceCounterText.text).toBe("Piece 1 of 6");

    await interactor.trigger(saveBtn);
    await sleep(150);

    expect(pieceCounterText.text).toBe("Piece 2 of 6");
  }
}
