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
import { ToleranceStatus } from "./Core/ProfileDeltaEvaluator";

const THEME_FONT = requireAsset("../Fonts/Inter.ttf") as Font;
const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material;
const ICON_MIC = requireAsset("../Icons/mic.png") as Texture;
const ICON_CHECK = requireAsset("../Icons/check_circle.png") as Texture;
const ICON_WARN = requireAsset("../Icons/warning.png") as Texture;

// Calibrated for z = -58.0 cm (StudioCardAnchor at (+15.0, -21.0, -58.0) cm)
const DIST_CM = 58.0;
const FONT_SIZE_SCALE = 1.0;

type TextRole =
  | "Headline1"
  | "Headline2"
  | "Subheadline"
  | "Button"
  | "Callout"
  | "Body"
  | "Caption";

const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Headline1: { size: 54, weight: 700 },
  Headline2: { size: 48, weight: 700 },
  Subheadline: { size: 41, weight: 700 },
  Button: { size: 36, weight: 500 },
  Callout: { size: 39, weight: 700 },
  Body: { size: 38, weight: 500 },
  Caption: { size: 32, weight: 500 },
};

function roleSize(role: TextRole, distanceCm: number = DIST_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110.0);
}

function applyTextRole(
  t: Text,
  role: TextRole,
  distanceCm: number = DIST_CM
): void {
  t.size = roleSize(role, distanceCm);
  (t as Text & { weight?: number }).weight = TYPE_SCALE[role].weight;
}

const BUTTON_LABEL_Z = 0.08;

/**
 * ClayViewStudioUI — Calibrated 9.0 cm world-space Studio Card built on SpectaclesUIKit.
 * Placed at StudioCardAnchor (+15.0, -21.0, -58.0) cm so its right edge (+19.5 cm)
 * stays strictly inside the +/-20.55 cm SPECS 37x32 deg horizontal FOV boundary.
 */
@component
export class ClayViewStudioUI extends BaseScriptComponent {
  @ui.label('<span style="color: #4AF2FF;">ClayViewStudioUI — Studio Card HUD</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Calibrated card width in cm (compact so it never overlaps clay or clips FOV)")
  @widget(new SliderWidget(7.0, 11.0, 0.5))
  public cardWidthCm: number = 7.6;

  @input
  @hint("Inner horizontal/vertical padding in cm")
  @widget(new SliderWidget(0.3, 1.2, 0.1))
  public paddingCm: number = 0.42;

  @input
  @hint("Row spacing in cm")
  @widget(new SliderWidget(0.2, 1.0, 0.05))
  public rowGapCm: number = 0.24;

  @input
  @hint("Primary Ivory text color for additive LCOS display")
  @widget(new ColorWidget())
  public ivoryColor: vec4 = new vec4(1.0, 0.99, 0.96, 1.0);

  @input
  @hint("Accent Cyan color for secondary labels and porcelain highlights")
  @widget(new ColorWidget())
  public cyanColor: vec4 = new vec4(0.29, 0.95, 1.0, 1.0);

  @input
  @hint("Teal color for <= 2 mm tolerance match")
  @widget(new ColorWidget())
  public tealColor: vec4 = new vec4(0.18, 0.9, 0.62, 1.0);

  @input
  @hint("Amber color for 2-4 mm tolerance warning")
  @widget(new ColorWidget())
  public amberColor: vec4 = new vec4(1.0, 0.78, 0.34, 1.0);

  @input
  @hint("Coral color for > 4 mm critical deviation")
  @widget(new ColorWidget())
  public coralColor: vec4 = new vec4(1.0, 0.42, 0.42, 1.0);
  @ui.group_end

  private _onCycleShrinkage = new Event<void>();
  private _onToggleWireframe = new Event<void>();
  private _onCyclePreset = new Event<void>();
  private _onResetClay = new Event<void>();
  private _onStageAction = new Event<void>();
  private _onCycleClayMass = new Event<void>();
  private _onCycleHandBuildTech = new Event<void>();
  private _onCycleMoistureState = new Event<void>();
  private _onApplyFreeformSculpt = new Event<void>();
  private _onOpenDecoration = new Event<void>();
  private _onOpenFiring = new Event<void>();

  public get onCycleShrinkage(): PublicApi<void> {
    return this._onCycleShrinkage.publicApi();
  }
  public get onToggleWireframe(): PublicApi<void> {
    return this._onToggleWireframe.publicApi();
  }
  public get onCyclePreset(): PublicApi<void> {
    return this._onCyclePreset.publicApi();
  }
  public get onResetClay(): PublicApi<void> {
    return this._onResetClay.publicApi();
  }
  public get onStageAction(): PublicApi<void> {
    return this._onStageAction.publicApi();
  }
  public get onCycleClayMass(): PublicApi<void> {
    return this._onCycleClayMass.publicApi();
  }
  public get onCycleHandBuildTech(): PublicApi<void> {
    return this._onCycleHandBuildTech.publicApi();
  }
  public get onCycleMoistureState(): PublicApi<void> {
    return this._onCycleMoistureState.publicApi();
  }
  public get onApplyFreeformSculpt(): PublicApi<void> {
    return this._onApplyFreeformSculpt.publicApi();
  }
  public get onOpenDecoration(): PublicApi<void> {
    return this._onOpenDecoration.publicApi();
  }
  public get onOpenFiring(): PublicApi<void> {
    return this._onOpenFiring.publicApi();
  }

  private stageBadgeText: Text | null = null;
  private stageActionLabelText: Text | null = null;
  private clayBodyBtnLabelText: Text | null = null;
  private handBuildTechBtnLabelText: Text | null = null;
  private moistureBtnLabelText: Text | null = null;
  private sculptStyleBtnLabelText: Text | null = null;
  private clayMassBtnLabelText: Text | null = null;
  private shrinkageBadgeText: Text | null = null;
  private handBuildInfoText: Text | null = null;
  private bellyZoneStatusText: Text | null = null;
  private matchPercentText: Text | null = null;
  private hintCaptionText: Text | null = null;
  private statusIconMat: Material | null = null;
  private built: boolean = false;

  onAwake(): void {
    this.buildCard();
  }

  private buildCard(): void {
    if (this.built) return;
    this.built = true;

    const existingCanvas = this.sceneObject.getComponent("Component.Canvas");
    if (!existingCanvas) {
      this.sceneObject.createComponent("Component.Canvas");
    }

    // BackPlate FIRST so Canvas Hierarchy DFS draws backing behind content
    const backPlate = this.sceneObject.createComponent(
      BackPlate.getTypeName()
    ) as BackPlate;
    backPlate.size = new vec2(this.cardWidthCm, 16.0);

    // Content container lifted +0.6 cm in Z to avoid z-fighting with BackPlate
    const content = global.scene.createSceneObject("Content");
    content.setParent(this.sceneObject);
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6));

    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout;
    flex.width = this.cardWidthCm;
    flex.height = -1;
    flex.direction = FlexDirection.Column;
    flex.alignItems = FlexAlign.Stretch;
    flex.justifyContent = FlexJustify.Start;
    flex.rowGap = this.rowGapCm;
    flex.paddingTop = this.paddingCm;
    flex.paddingBottom = this.paddingCm;
    flex.paddingLeft = this.paddingCm;
    flex.paddingRight = this.paddingCm;

    flex.onLayoutComplete.add((r) => {
      backPlate.size = new vec2(
        Math.max(this.cardWidthCm, r.containerWidth),
        Math.max(12.0, r.containerHeight)
      );
    });

    const innerW = this.cardWidthCm - this.paddingCm * 2;

    // 1. Header Row: Mic icon + "CLAYVIEW"
    const headerRow = global.scene.createSceneObject("HeaderRow");
    headerRow.setParent(content);
    const headerFlex = headerRow.createComponent(
      FlexLayout.getTypeName()
    ) as FlexLayout;
    headerFlex.direction = FlexDirection.Row;
    headerFlex.alignItems = FlexAlign.Center;
    headerFlex.justifyContent = FlexJustify.Center;
    headerFlex.columnGap = 0.3;
    headerFlex.width = innerW;
    headerFlex.height = 1.15;
    const headerItem = headerRow.createComponent(
      FlexItem.getTypeName()
    ) as FlexItem;
    headerItem.alignSelf = FlexAlignSelf.Stretch;
    headerItem.overrideHeight = 1.15;

    this.addIcon(headerRow, "AsrMicIcon", ICON_MIC, 0.85, this.cyanColor);
    this.addRowText(
      headerRow,
      "HeaderTitle",
      "CLAYVIEW",
      "Subheadline",
      4.6,
      this.ivoryColor
    );

    // 2. StageBadgeText ("STEP 1/5 · PILIH CLAY BODY" .. "STEP 5/5 · HASIL AKHIR")
    const stageBadge = this.addColumnText(
      content,
      "StageBadgeText",
      "STEP 1/5 · PILIH CLAY BODY",
      "Caption",
      0.8,
      this.amberColor
    );
    this.stageBadgeText = stageBadge.text;

    // 3. ShrinkageBadgeText ("12% STONEWARE" -> "14% PORCELAIN" -> "10% EARTHENWARE" -> "11% PAPER CLAY")
    const badge = this.addColumnText(
      content,
      "ShrinkageBadgeText",
      "12% STONEWARE",
      "Callout",
      0.9,
      this.cyanColor
    );
    this.shrinkageBadgeText = badge.text;

    // 3b. Active Hand-Building Technique & Moisture State telemetry
    const hbInfo = this.addColumnText(
      content,
      "HandBuildInfoText",
      "Pinching · plastic",
      "Caption",
      0.75,
      this.ivoryColor
    );
    this.handBuildInfoText = hbInfo.text;

    // 4. Status Row: Status Icon + BellyZoneStatusText ("MATCH_TEAL" / "OVER_CORAL")
    const statusRow = global.scene.createSceneObject("StatusRow");
    statusRow.setParent(content);
    const statusFlex = statusRow.createComponent(
      FlexLayout.getTypeName()
    ) as FlexLayout;
    statusFlex.direction = FlexDirection.Row;
    statusFlex.alignItems = FlexAlign.Center;
    statusFlex.justifyContent = FlexJustify.Center;
    statusFlex.columnGap = 0.25;
    statusFlex.width = innerW;
    statusFlex.height = 0.9;
    const statusItem = statusRow.createComponent(
      FlexItem.getTypeName()
    ) as FlexItem;
    statusItem.alignSelf = FlexAlignSelf.Stretch;
    statusItem.overrideHeight = 0.9;

    const statusIcon = this.addIcon(
      statusRow,
      "ToleranceIcon",
      ICON_CHECK,
      0.75,
      this.tealColor
    );
    this.statusIconMat = statusIcon.material;
    const bellyStatus = this.addRowText(
      statusRow,
      "BellyZoneStatusText",
      "MATCH_TEAL",
      "Callout",
      5.4,
      this.tealColor
    );
    this.bellyZoneStatusText = bellyStatus.text;

    // 5. MatchPercentText ("100%")
    const match = this.addColumnText(
      content,
      "MatchPercentText",
      "100%",
      "Headline2",
      1.15,
      this.ivoryColor
    );
    this.matchPercentText = match.text;

    // 6. 5-Stage Hand-Building Studio Controls (SIK Interactables)
    const btnW = Math.min(6.7, innerW);
    const btnH = 1.05;

    const stageBtn = this.addActionButton(
      content,
      "StageActionBtn",
      "Mulai Shaping",
      btnW,
      btnH,
      () => this._onStageAction.invoke()
    );
    this.stageActionLabelText = stageBtn.labelText;

    const clayBodyBtn = this.addActionButton(
      content,
      "ShrinkageCycleBtn",
      "Clay: Stoneware",
      btnW,
      btnH,
      () => this._onCycleShrinkage.invoke()
    );
    this.clayBodyBtnLabelText = clayBodyBtn.labelText;

    const techBtn = this.addActionButton(
      content,
      "HandBuildTechBtn",
      "Tech: Pinching",
      btnW,
      btnH,
      () => this._onCycleHandBuildTech.invoke()
    );
    this.handBuildTechBtnLabelText = techBtn.labelText;

    const sculptBtn = this.addActionButton(
      content,
      "SculptStyleBtn",
      "Sculpt: +Wiggle Rim",
      btnW,
      btnH,
      () => this._onApplyFreeformSculpt.invoke()
    );
    this.sculptStyleBtnLabelText = sculptBtn.labelText;

    const moistureBtn = this.addActionButton(
      content,
      "MoistureStateBtn",
      "State: Plastic",
      btnW,
      btnH,
      () => this._onCycleMoistureState.invoke()
    );
    this.moistureBtnLabelText = moistureBtn.labelText;

    const massBtn = this.addActionButton(
      content,
      "ClayMassBtn",
      "Mass: 900g",
      btnW,
      btnH,
      () => this._onCycleClayMass.invoke()
    );
    this.clayMassBtnLabelText = massBtn.labelText;

    this.addActionButton(
      content,
      "OpenDecorationBtn",
      "Dekorasi [>]",
      btnW,
      btnH,
      () => this._onOpenDecoration.invoke()
    );

    this.addActionButton(
      content,
      "OpenFiringBtn",
      "Pembakaran [>]",
      btnW,
      btnH,
      () => this._onOpenFiring.invoke()
    );

    // 7. Dynamic Guided Flow Caption
    const caption = this.addColumnText(
      content,
      "PreviewStandInCaption",
      "Drag Hand Tool anywhere for 3D sculpt!",
      "Caption",
      0.7,
      new vec4(1.0, 0.99, 0.96, 0.72)
    );
    this.hintCaptionText = caption.text;
  }

  public updateMetrics(
    shrinkageLabel: string,
    bellyStatus: ToleranceStatus,
    matchPercentage: number,
    clayBodyShortLabel?: string,
    stageTitle?: string,
    stageActionLabel?: string,
    clayMassLabel?: string,
    stageHintCaption?: string,
    handBuildTechLabel?: string,
    moistureStateLabel?: string,
    handBuildSummaryLine?: string,
    sculptStyleLabel?: string
  ): void {
    if (stageTitle && this.stageBadgeText) {
      this.stageBadgeText.text = stageTitle;
      if (this.stageBadgeText.textFill) {
        this.stageBadgeText.textFill.color =
          stageTitle.includes("5/5") || stageTitle.includes("2/5")
            ? this.tealColor
            : stageTitle.includes("3/5") || stageTitle.includes("4/5")
            ? this.cyanColor
            : this.amberColor;
      }
    }
    if (stageActionLabel && this.stageActionLabelText) {
      this.stageActionLabelText.text = stageActionLabel;
    }
    if (clayBodyShortLabel && this.clayBodyBtnLabelText) {
      this.clayBodyBtnLabelText.text = clayBodyShortLabel;
    }
    if (handBuildTechLabel && this.handBuildTechBtnLabelText) {
      this.handBuildTechBtnLabelText.text = handBuildTechLabel;
    }
    if (sculptStyleLabel && this.sculptStyleBtnLabelText) {
      this.sculptStyleBtnLabelText.text = sculptStyleLabel;
    }
    if (moistureStateLabel && this.moistureBtnLabelText) {
      this.moistureBtnLabelText.text = moistureStateLabel;
    }
    if (clayMassLabel && this.clayMassBtnLabelText) {
      this.clayMassBtnLabelText.text = clayMassLabel;
    }
    if (handBuildSummaryLine && this.handBuildInfoText) {
      this.handBuildInfoText.text = handBuildSummaryLine;
    }
    if (stageHintCaption && this.hintCaptionText) {
      this.hintCaptionText.text = stageHintCaption;
    }
    if (this.shrinkageBadgeText) {
      this.shrinkageBadgeText.text = shrinkageLabel;
    }
    if (this.bellyZoneStatusText) {
      this.bellyZoneStatusText.text = bellyStatus;
      const color = this.colorForStatus(bellyStatus);
      if (this.bellyZoneStatusText.textFill) {
        this.bellyZoneStatusText.textFill.color = color;
      }
      if (this.statusIconMat) {
        this.statusIconMat.mainPass.baseTex =
          bellyStatus === "MATCH_TEAL" ? ICON_CHECK : ICON_WARN;
        this.statusIconMat.mainPass.baseColor = color;
      }
    }
    if (this.matchPercentText) {
      this.matchPercentText.text = `${matchPercentage}%`;
    }
  }

  private colorForStatus(status: ToleranceStatus): vec4 {
    switch (status) {
      case "MATCH_TEAL":
        return this.tealColor;
      case "WARN_AMBER":
        return this.amberColor;
      case "OVER_CORAL":
      case "UNDER_CORAL":
        return this.coralColor;
    }
  }

  private addColumnText(
    parent: SceneObject,
    name: string,
    initialText: string,
    role: TextRole,
    heightCm: number,
    color: vec4
  ): { text: Text; item: FlexItem } {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    const t = so.createComponent("Component.Text") as Text;
    t.text = initialText;
    t.font = THEME_FONT;
    t.depthTest = true;
    applyTextRole(t, role);
    if (t.textFill) {
      t.textFill.color = color;
    }
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.5, 0.5, -heightCm / 2, heightCm / 2);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.alignSelf = FlexAlignSelf.Stretch;
    item.overrideHeight = heightCm;
    return { text: t, item };
  }

  private addRowText(
    parent: SceneObject,
    name: string,
    initialText: string,
    role: TextRole,
    widthCm: number,
    color: vec4
  ): { text: Text; item: FlexItem } {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    const t = so.createComponent("Component.Text") as Text;
    t.text = initialText;
    t.font = THEME_FONT;
    t.depthTest = true;
    applyTextRole(t, role);
    if (t.textFill) {
      t.textFill.color = color;
    }
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -0.6, 0.6);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = widthCm;
    item.overrideHeight = 1.05;
    return { text: t, item };
  }

  private addIcon(
    parent: SceneObject,
    name: string,
    texture: Texture,
    sizeCm: number,
    tint: vec4
  ): { image: Image; material: Material; item: FlexItem } {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    const img = so.createComponent("Component.Image") as Image;

    const mat = IMAGE_MATERIAL.clone();
    mat.mainPass.baseTex = texture;
    mat.mainPass.baseColor = tint;
    mat.mainPass.depthTest = true;
    mat.mainPass.depthWrite = false;
    img.clearMaterials();
    img.addMaterial(mat);

    so.getTransform().setLocalScale(new vec3(sizeCm, sizeCm, 1));
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = sizeCm;
    item.overrideHeight = sizeCm;
    return { image: img, material: mat, item };
  }

  private addActionButton(
    parent: SceneObject,
    name: string,
    label: string,
    widthCm: number,
    heightCm: number,
    onClick: () => void
  ): { item: FlexItem; labelText: Text } {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);

    const btn = so.createComponent(Button.getTypeName()) as Button;
    btn.size = new vec3(widthCm, heightCm, 0.6);
    btn.onInitialized.add(() => {
      btn.size = new vec3(widthCm, heightCm, 0.6);
    });
    btn.onTriggerUp.add(() => {
      onClick();
    });

    // Label lifted +0.08 cm in Z above the button face
    const labelSO = global.scene.createSceneObject(`${name}_Label`);
    labelSO.setParent(so);
    labelSO.getTransform().setLocalPosition(new vec3(0, 0, BUTTON_LABEL_Z));
    const t = labelSO.createComponent("Component.Text") as Text;
    t.text = label;
    t.font = THEME_FONT;
    t.depthTest = true;
    applyTextRole(t, "Button");
    if (t.textFill) {
      t.textFill.color = this.ivoryColor;
    }
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    const labelW = Math.max(1.0, widthCm - 0.4);
    t.layoutRect = Rect.create(-labelW / 2, labelW / 2, -0.65, 0.65);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.alignSelf = FlexAlignSelf.Center;
    item.overrideWidth = widthCm;
    item.overrideHeight = heightCm;
    return { item, labelText: t };
  }
}
