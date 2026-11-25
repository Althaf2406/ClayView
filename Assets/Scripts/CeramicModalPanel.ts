import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import {
  FlexAlign,
  FlexAlignSelf,
  FlexDirection,
  FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import {
  CeramicWorkflowStage,
  SimulationResult,
} from "./Core/CeramicMaterialTypes";

const THEME_FONT = requireAsset("../Fonts/Inter.ttf") as Font;
const DIST_CM = 58.0;
const BUTTON_LABEL_Z = 0.08;

function scaledSize(basePx: number): number {
  return basePx * (DIST_CM / 110.0);
}

export interface CeramicModalViewState {
  readonly stage: CeramicWorkflowStage;
  readonly surfaceLabel: string;
  readonly glazeMethodLabel: string;
  readonly glazeCteLabel: string;
  readonly craftPrepLabel: string;
  readonly firingMethodLabel: string;
  readonly coolingLabel: string;
  readonly kilnHostLabel: string;
  readonly bisqueVentLabel: string;
  readonly evaluation: SimulationResult;
}

/**
 * CeramicModalPanel — Lightweight secondary SpectaclesUIKit spatial modal panel
 * that opens on demand for:
 * - Stage 3: Opsi Dekorasi & Permukaan (Slip/Body, Mechanical, Glaze Application & CTE Fit)
 * - Stage 4: Opsi Pembakaran & Atmosfer (9 Firing Methods + 4 Critical Thermal Milestones)
 * - Stage 5: Hasil Akhir & Evaluasi Kegagalan (Status, Fired Shrinkage, Food-Safe, Defects)
 *
 * Keeps the main Hand-Building workspace completely unobstructed until opened via
 * [Dekorasi] or [Pembakaran] buttons on the Studio Card.
 */
@component
export class CeramicModalPanel extends BaseScriptComponent {
  @ui.label('<span style="color: #4AF2FF;">CeramicModalPanel — Decoration / Firing / Result Modal</span>')
  @ui.separator
  @input
  @hint("Calibrated modal width in cm for SPECS additive FOV")
  @widget(new SliderWidget(7.0, 12.0, 0.5))
  public panelWidthCm: number = 8.0;

  private _onCycleSurface = new Event<void>();
  private _onCycleGlazeMethod = new Event<void>();
  private _onCycleGlazeCte = new Event<void>();
  private _onToggleCraftPrep = new Event<void>();
  private _onCycleFiringMethod = new Event<void>();
  private _onCycleCooling = new Event<void>();
  private _onToggleKilnHost = new Event<void>();
  private _onCycleBisqueVent = new Event<void>();
  private _onPrimaryNext = new Event<void>();
  private _onSecondaryBack = new Event<void>();

  public get onCycleSurface(): PublicApi<void> {
    return this._onCycleSurface.publicApi();
  }
  public get onCycleGlazeMethod(): PublicApi<void> {
    return this._onCycleGlazeMethod.publicApi();
  }
  public get onCycleGlazeCte(): PublicApi<void> {
    return this._onCycleGlazeCte.publicApi();
  }
  public get onToggleCraftPrep(): PublicApi<void> {
    return this._onToggleCraftPrep.publicApi();
  }
  public get onCycleFiringMethod(): PublicApi<void> {
    return this._onCycleFiringMethod.publicApi();
  }
  public get onCycleCooling(): PublicApi<void> {
    return this._onCycleCooling.publicApi();
  }
  public get onToggleKilnHost(): PublicApi<void> {
    return this._onToggleKilnHost.publicApi();
  }
  public get onCycleBisqueVent(): PublicApi<void> {
    return this._onCycleBisqueVent.publicApi();
  }
  public get onPrimaryNext(): PublicApi<void> {
    return this._onPrimaryNext.publicApi();
  }
  public get onSecondaryBack(): PublicApi<void> {
    return this._onSecondaryBack.publicApi();
  }

  private titleText: Text | null = null;
  private statusText: Text | null = null;
  private metricsText: Text | null = null;
  private detailText: Text | null = null;
  private milestoneText: Text | null = null;

  private optionBtn1Obj: SceneObject | null = null;
  private optionBtn1Label: Text | null = null;
  private optionBtn2Obj: SceneObject | null = null;
  private optionBtn2Label: Text | null = null;
  private optionBtn3Obj: SceneObject | null = null;
  private optionBtn3Label: Text | null = null;
  private optionBtn4Obj: SceneObject | null = null;
  private optionBtn4Label: Text | null = null;

  private primaryNextLabel: Text | null = null;
  private secondaryBackLabel: Text | null = null;

  private activeStage: CeramicWorkflowStage = "SELECT_CLAY_BODY";
  private built: boolean = false;

  private readonly ivory = new vec4(1.0, 0.99, 0.96, 1.0);
  private readonly cyan = new vec4(0.29, 0.95, 1.0, 1.0);
  private readonly teal = new vec4(0.18, 0.9, 0.62, 1.0);
  private readonly amber = new vec4(1.0, 0.78, 0.34, 1.0);
  private readonly coral = new vec4(1.0, 0.42, 0.42, 1.0);

  onAwake(): void {
    this.buildModal();
  }

  private buildModal(): void {
    if (this.built) return;
    this.built = true;

    if (!this.sceneObject.getComponent("Component.Canvas")) {
      this.sceneObject.createComponent("Component.Canvas");
    }

    const backPlate = this.sceneObject.createComponent(
      BackPlate.getTypeName()
    ) as BackPlate;
    backPlate.size = new vec2(this.panelWidthCm, 17.5);

    const content = global.scene.createSceneObject("ModalContent");
    content.setParent(this.sceneObject);
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6));

    const pad = 0.45;
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout;
    flex.width = this.panelWidthCm;
    flex.height = -1;
    flex.direction = FlexDirection.Column;
    flex.alignItems = FlexAlign.Stretch;
    flex.justifyContent = FlexJustify.Start;
    flex.rowGap = 0.28;
    flex.paddingTop = pad;
    flex.paddingBottom = pad;
    flex.paddingLeft = pad;
    flex.paddingRight = pad;

    flex.onLayoutComplete.add((r) => {
      backPlate.size = new vec2(
        Math.max(this.panelWidthCm, r.containerWidth),
        Math.max(13.0, r.containerHeight)
      );
    });

    const innerW = this.panelWidthCm - pad * 2;
    const btnW = Math.min(7.6, innerW);
    const btnH = 1.2;

    this.titleText = this.addText(
      content,
      "ModalTitleText",
      "DEKORASI & PERMUKAAN",
      38,
      1.05,
      this.cyan
    );

    this.statusText = this.addText(
      content,
      "ModalStatusText",
      "Status: Success",
      35,
      0.95,
      this.teal
    );

    this.metricsText = this.addText(
      content,
      "ModalMetricsText",
      "Food-Safe: YES | Watertight: YES",
      28,
      0.85,
      this.ivory
    );

    this.milestoneText = this.addText(
      content,
      "ModalMilestoneText",
      "150C:OK | 573C:OK | 1000C:OK | 226C:OK",
      25,
      0.8,
      this.cyan
    );

    this.detailText = this.addText(
      content,
      "ModalDetailText",
      "Select decoration or firing options below",
      25,
      1.35,
      new vec4(1.0, 0.99, 0.96, 0.85)
    );

    const b1 = this.addButton(
      content,
      "ModalOption1Btn",
      "Surface: Raw",
      btnW,
      btnH,
      () => {
        if (this.activeStage === "DECORATION_OPTIONS") {
          this._onCycleSurface.invoke();
        } else if (this.activeStage === "FIRING_OPTIONS") {
          this._onCycleFiringMethod.invoke();
        }
      }
    );
    this.optionBtn1Obj = b1.sceneObject;
    this.optionBtn1Label = b1.label;

    const b2 = this.addButton(
      content,
      "ModalOption2Btn",
      "Glaze: Unglazed",
      btnW,
      btnH,
      () => {
        if (this.activeStage === "DECORATION_OPTIONS") {
          this._onCycleGlazeMethod.invoke();
        } else if (this.activeStage === "FIRING_OPTIONS") {
          this._onCycleCooling.invoke();
        }
      }
    );
    this.optionBtn2Obj = b2.sceneObject;
    this.optionBtn2Label = b2.label;

    const b3 = this.addButton(
      content,
      "ModalOption3Btn",
      "CTE: Optimal",
      btnW,
      btnH,
      () => {
        if (this.activeStage === "DECORATION_OPTIONS") {
          this._onCycleGlazeCte.invoke();
        } else if (this.activeStage === "FIRING_OPTIONS") {
          this._onToggleKilnHost.invoke();
        }
      }
    );
    this.optionBtn3Obj = b3.sceneObject;
    this.optionBtn3Label = b3.label;

    const b4 = this.addButton(
      content,
      "ModalOption4Btn",
      "Prep: Score&Slip ON",
      btnW,
      btnH,
      () => {
        if (this.activeStage === "DECORATION_OPTIONS") {
          this._onToggleCraftPrep.invoke();
        } else if (this.activeStage === "FIRING_OPTIONS") {
          this._onCycleBisqueVent.invoke();
        }
      }
    );
    this.optionBtn4Obj = b4.sceneObject;
    this.optionBtn4Label = b4.label;

    const nextBtn = this.addButton(
      content,
      "ModalPrimaryNextBtn",
      "Lanjut: Pembakaran",
      btnW,
      btnH,
      () => this._onPrimaryNext.invoke()
    );
    this.primaryNextLabel = nextBtn.label;

    const backBtn = this.addButton(
      content,
      "ModalSecondaryBackBtn",
      "Kembali ke Shaping",
      btnW,
      btnH,
      () => this._onSecondaryBack.invoke()
    );
    this.secondaryBackLabel = backBtn.label;
  }

  public syncState(view: CeramicModalViewState): void {
    this.activeStage = view.stage;
    const isModalOpen =
      view.stage === "DECORATION_OPTIONS" ||
      view.stage === "FIRING_OPTIONS" ||
      view.stage === "FINAL_RESULT";

    this.sceneObject.enabled = isModalOpen;
    if (!isModalOpen) return;

    const ev = view.evaluation;
    const statusColor =
      ev.status === "Success"
        ? this.teal
        : ev.status === "Warning (Minor Defect)"
        ? this.amber
        : this.coral;

    const topIssue = ev.issues.find(
      (i) => i.severity === "BLOCKED" || i.severity === "CRITICAL"
    ) || ev.issues.find((i) => i.severity === "WARNING") || ev.issues[0];

    const mShort = ev.thermalMilestones
      .map((m) => {
        const tag =
          m.id === "WATER_EVAP_150C"
            ? "150C"
            : m.id === "QUARTZ_INVERSION_573C"
            ? "573C"
            : m.id === "DECOMPOSITION_700_1000C"
            ? "1000C"
            : "226C";
        const code =
          m.status === "SAFE" ? "OK" : m.status === "WARNING" ? "WARN" : "FAIL";
        return `${tag}:${code}`;
      })
      .join(" | ");

    if (this.statusText) {
      this.statusText.text = ev.status;
      if (this.statusText.textFill) this.statusText.textFill.color = statusColor;
    }

    if (this.milestoneText) {
      this.milestoneText.text = mShort;
    }

    const showOptions =
      view.stage === "DECORATION_OPTIONS" || view.stage === "FIRING_OPTIONS";
    if (this.optionBtn1Obj) this.optionBtn1Obj.enabled = showOptions;
    if (this.optionBtn2Obj) this.optionBtn2Obj.enabled = showOptions;
    if (this.optionBtn3Obj) this.optionBtn3Obj.enabled = showOptions;
    if (this.optionBtn4Obj) this.optionBtn4Obj.enabled = showOptions;

    if (view.stage === "DECORATION_OPTIONS") {
      if (this.titleText) this.titleText.text = "STEP 3/5 · DEKORASI";
      if (this.metricsText) {
        this.metricsText.text = `Glaze Fit: ${ev.glazeFitStatus} | Food-Safe: ${
          ev.isFoodSafe ? "YES" : "NO"
        }`;
      }
      if (this.detailText) {
        this.detailText.text = topIssue
          ? `${topIssue.severity}: ${topIssue.title}`
          : "Surface & Glaze CTE compatible";
      }
      if (this.optionBtn1Label) this.optionBtn1Label.text = view.surfaceLabel;
      if (this.optionBtn2Label) this.optionBtn2Label.text = view.glazeMethodLabel;
      if (this.optionBtn3Label) this.optionBtn3Label.text = view.glazeCteLabel;
      if (this.optionBtn4Label) this.optionBtn4Label.text = view.craftPrepLabel;
      if (this.primaryNextLabel) this.primaryNextLabel.text = "Lanjut: Pembakaran >";
      if (this.secondaryBackLabel) this.secondaryBackLabel.text = "< Kembali Shaping";
    } else if (view.stage === "FIRING_OPTIONS") {
      if (this.titleText) this.titleText.text = "STEP 4/5 · PEMBAKARAN";
      if (this.metricsText) {
        this.metricsText.text = `Peak: ${ev.peakTempC} C | Shrink: -${ev.appliedShrinkagePct}%`;
      }
      if (this.detailText) {
        this.detailText.text = topIssue
          ? `${topIssue.severity}: ${topIssue.title}`
          : "Thermal curve & kiln atmosphere safe";
      }
      if (this.optionBtn1Label) this.optionBtn1Label.text = view.firingMethodLabel;
      if (this.optionBtn2Label) this.optionBtn2Label.text = view.coolingLabel;
      if (this.optionBtn3Label) this.optionBtn3Label.text = view.kilnHostLabel;
      if (this.optionBtn4Label) this.optionBtn4Label.text = view.bisqueVentLabel;
      if (this.primaryNextLabel) this.primaryNextLabel.text = "Bakar & Evaluasi >";
      if (this.secondaryBackLabel) this.secondaryBackLabel.text = "< Kembali Dekorasi";
    } else if (view.stage === "FINAL_RESULT") {
      if (this.titleText) this.titleText.text = "STEP 5/5 · HASIL AKHIR";
      if (this.metricsText) {
        this.metricsText.text = `H: ${ev.wetDimensionsCm.heightCm.toFixed(1)}->${ev.firedDimensionsCm.heightCm.toFixed(1)}cm (-${ev.appliedShrinkagePct}%) | Food:${
          ev.isFoodSafe ? "YES" : "NO"
        } Water:${ev.isWatertight ? "YES" : "NO"}`;
      }
      if (this.detailText) {
        if (topIssue) {
          const extra =
            ev.issues.length > 1 ? ` (+${ev.issues.length - 1} notes)` : "";
          this.detailText.text = `${topIssue.title}${extra}`;
        } else {
          this.detailText.text = `Fit: ${ev.glazeFitStatus} · Zero structural defects!`;
        }
      }
      if (this.primaryNextLabel) this.primaryNextLabel.text = "< Ubah Pembakaran";
      if (this.secondaryBackLabel) this.secondaryBackLabel.text = "Shaping Baru (Reset)";
    }
  }

  private addText(
    parent: SceneObject,
    name: string,
    initialText: string,
    pxSize: number,
    heightCm: number,
    color: vec4
  ): Text {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    const t = so.createComponent("Component.Text") as Text;
    t.text = initialText;
    t.font = THEME_FONT;
    t.size = scaledSize(pxSize);
    t.depthTest = true;
    if (t.textFill) t.textFill.color = color;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Wrap;
    t.verticalOverflow = VerticalOverflow.Overflow;
    const textW = this.panelWidthCm - 0.9;
    t.layoutRect = Rect.create(-textW / 2, textW / 2, -heightCm / 2, heightCm / 2);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.alignSelf = FlexAlignSelf.Stretch;
    item.overrideHeight = heightCm;
    return t;
  }

  private addButton(
    parent: SceneObject,
    name: string,
    label: string,
    widthCm: number,
    heightCm: number,
    onClick: () => void
  ): { sceneObject: SceneObject; label: Text } {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);

    const btn = so.createComponent(Button.getTypeName()) as Button;
    btn.size = new vec3(widthCm, heightCm, 0.6);
    btn.onInitialized.add(() => {
      btn.size = new vec3(widthCm, heightCm, 0.6);
    });
    btn.onTriggerUp.add(() => onClick());

    const labelSO = global.scene.createSceneObject(`${name}_Label`);
    labelSO.setParent(so);
    labelSO.getTransform().setLocalPosition(new vec3(0, 0, BUTTON_LABEL_Z));
    const t = labelSO.createComponent("Component.Text") as Text;
    t.text = label;
    t.font = THEME_FONT;
    t.size = scaledSize(32);
    t.depthTest = true;
    if (t.textFill) t.textFill.color = this.ivory;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    const labelW = Math.max(1.0, widthCm - 0.4);
    t.layoutRect = Rect.create(-labelW / 2, labelW / 2, -0.6, 0.6);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.alignSelf = FlexAlignSelf.Center;
    item.overrideWidth = widthCm;
    item.overrideHeight = heightCm;
    return { sceneObject: so, label: t };
  }
}
