import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { expect } from "Leaf.lspkg/Utils/common/Expect";

/**
 * DC-4: 5-Stage Ceramic Materials Flow (Clay Body -> Hand-Building -> Dekorasi -> Pembakaran -> Hasil Akhir)
 * Verifies StageActionBtn enters Hand-Building, OpenDecorationBtn opens the Decoration Modal,
 * and ModalPrimaryNextBtn advances through Firing Options to Final Evaluation.
 */
@component
export class SeriesManagementScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(300);

    const interactor = new DefaultLeafInteractor();
    const stageBtn = findInteractableByName("StageActionBtn");
    const decorBtn = findInteractableByName("OpenDecorationBtn");
    const stageBadgeText = findSceneObjectByName(
      "StageBadgeText"
    ).getComponent("Component.Text") as Text;

    expect(stageBtn).toBeTruthy();
    expect(decorBtn).toBeTruthy();
    expect(stageBadgeText.text).toBe("STEP 1/5 · PILIH CLAY BODY");

    // Step 1 -> Step 2 (Hand-Building)
    await interactor.trigger(stageBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 2/5 · HAND-BUILDING");

    // Step 2 -> Step 3 (Open Dekorasi Modal)
    await interactor.trigger(decorBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 3/5 · OPSI DEKORASI");

    // Step 3 -> Step 4 (Pembakaran) -> Step 5 (Hasil Akhir)
    const modalNextBtn = findInteractableByName("ModalPrimaryNextBtn");
    expect(modalNextBtn).toBeTruthy();
    await interactor.trigger(modalNextBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 4/5 · PEMBAKARAN");

    await interactor.trigger(modalNextBtn);
    await sleep(150);
    expect(stageBadgeText.text).toBe("STEP 5/5 · HASIL & EVALUASI");
  }
}
