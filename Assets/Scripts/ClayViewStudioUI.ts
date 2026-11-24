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
  Button: { size: 39, weight: 500 },
  Callout: { size: 39, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 34, weight: 500 },
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
  @hint("Calibrated card width in cm (must be <= 9.0 cm at x=+15, z=-58)")
  @widget(new SliderWidget(7.0, 11.0, 0.5))
  public cardWidthCm: number = 9.0;

  @input
  @hint("Inner horizontal/vertical padding in cm")
  @widget(new SliderWidget(0.3, 1.2, 0.1))
  public paddingCm: number = 0.6;

  @input
  @hint("Row spacing in cm")
  @widget(new SliderWidget(0.2, 1.0, 0.05))
  public rowGapCm: number = 0.45;

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
  private _onSavePiece = new Event<void>();
  private _onToggleWireframe = new Event<void>();

  public get onCycleShrinkage(): PublicApi<void> {
    return this._onCycleShrinkage.publicApi();
  }
  public get onSavePiece(): PublicApi<void> {
    return this._onSavePiece.publicApi();
  }
  public get onToggleWireframe(): PublicApi<void> {
    return this._onToggleWireframe.publicApi();
  }

  private shrinkageBadgeText: Text | null = null;
  private pieceCounterText: Text | null = null;
  private bellyZoneStatusText: Text | null = null;
  private matchPercentText: Text | null = null;
  private statusIconImage: Image | null = null;
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
    backPlate.size = new vec2(this.cardWidthCm, 14.5);

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
        Math.max(11.0, r.containerHeight)
      );
    });

    const innerW = this.cardWidthCm - this.paddingCm * 2;
    const flexItems: FlexItem[] = [];

    // 1. Header Row: Mic icon + "CLAYVIEW"
    const headerRow = global.scene.createSceneObject("HeaderRow");
    headerRow.setParent(content);
    const headerFlex = headerRow.createComponent(
      FlexLayout.getTypeName()
    ) as FlexLayout;
    headerFlex.direction = FlexDirection.Row;
    headerFlex.alignItems = FlexAlign.Center;
    headerFlex.justifyContent = FlexJustify.Center;
    headerFlex.columnGap = 0.35;
    headerFlex.width = innerW;
    headerFlex.height = 1.2;
    const headerItem = headerRow.createComponent(
      FlexItem.getTypeName()
    ) as FlexItem;
    headerItem.alignSelf = FlexAlignSelf.Stretch;
    headerItem.overrideHeight = 1.2;
    flexItems.push(headerItem);

    const headerChildren: FlexItem[] = [];
    headerChildren.push(this.addIcon(headerRow, "AsrMicIcon", ICON_MIC, 0.9, this.cyanColor).item);
    headerChildren.push(
      this.addRowText(headerRow, "HeaderTitle", "CLAYVIEW", "Subheadline", innerW - 1.4, this.ivoryColor).item
    );
    headerFlex.addItems(headerChildren);

    // 2. ShrinkageBadgeText ("12% STONEWARE" -> "14% PORCELAIN")
    const badge = this.addColumnText(
      content,
      "ShrinkageBadgeText",
      "12% STONEWARE",
      "Callout",
      1.15,
      this.cyanColor
    );
    this.shrinkageBadgeText = badge.text;
    flexItems.push(badge.item);

    // 3. PieceCounterText ("Piece 1 of 6" -> "Piece 2 of 6")
    const counter = this.addColumnText(
      content,
      "PieceCounterText",
      "Piece 1 of 6",
      "Body",
      1.05,
      this.ivoryColor
    );
    this.pieceCounterText = counter.text;
    flexItems.push(counter.item);

    // 4. Status Row: Status Icon + BellyZoneStatusText ("MATCH_TEAL" / "OVER_CORAL")
    const statusRow = global.scene.createSceneObject("StatusRow");
    statusRow.setParent(content);
    const statusFlex = statusRow.createComponent(
      FlexLayout.getTypeName()
    ) as FlexLayout;
    statusFlex.direction = FlexDirection.Row;
    statusFlex.alignItems = FlexAlign.Center;
    statusFlex.justifyContent = FlexJustify.Center;
    statusFlex.columnGap = 0.3;
    statusFlex.width = innerW;
    statusFlex.height = 1.15;
    const statusItem = statusRow.createComponent(
      FlexItem.getTypeName()
    ) as FlexItem;
    statusItem.alignSelf = FlexAlignSelf.Stretch;
    statusItem.overrideHeight = 1.15;
    flexItems.push(statusItem);

    const statusIcon = this.addIcon(
      statusRow,
      "ToleranceIcon",
      ICON_CHECK,
      0.85,
      this.tealColor
    );
    this.statusIconImage = statusIcon.image;
    this.statusIconMat = statusIcon.material;
    const bellyStatus = this.addRowText(
      statusRow,
      "BellyZoneStatusText",
      "MATCH_TEAL",
      "Callout",
      innerW - 1.3,
      this.tealColor
    );
    this.bellyZoneStatusText = bellyStatus.text;
    statusFlex.addItems([statusIcon.item, bellyStatus.item]);

    // 5. MatchPercentText ("100%")
    const match = this.addColumnText(
      content,
      "MatchPercentText",
      "100%",
      "Headline1",
      1.55,
      this.ivoryColor
    );
    this.matchPercentText = match.text;
    flexItems.push(match.item);

    // 6. Action Buttons (UIKit Button = SIK Interactable for mouse & LEAF)
    const btnW = Math.min(7.6, innerW);
    const btnH = 1.75;

    flexItems.push(
      this.addActionButton(
        content,
        "ShrinkageCycleBtn",
        "Cycle Clay %",
        btnW,
        btnH,
        () => this._onCycleShrinkage.invoke()
      )
    );

    flexItems.push(
      this.addActionButton(
        content,
        "SavePieceBtn",
        "Next Piece",
        btnW,
        btnH,
        () => this._onSavePiece.invoke()
      )
    );

    flexItems.push(
      this.addActionButton(
        content,
        "ToggleWireframeBtn",
        "Toggle Mesh",
        btnW,
        btnH,
        () => this._onToggleWireframe.invoke()
      )
    );

    // 7. Honest Preview Stand-In Caption
    const standin = this.addColumnText(
      content,
      "PreviewStandInCaption",
      "Stand-In: Clay & Drag",
      "Caption",
      0.9,
      new vec4(1.0, 0.99, 0.96, 0.65)
    );
    flexItems.push(standin.item);

    flex.addItems(flexItems);
  }

  public updateMetrics(
    shrinkageLabel: string,
    pieceCounterLabel: string,
    bellyStatus: ToleranceStatus,
    matchPercentage: number
  ): void {
    if (this.shrinkageBadgeText) {
      this.shrinkageBadgeText.text = shrinkageLabel;
    }
    if (this.pieceCounterText) {
      this.pieceCounterText.text = pieceCounterLabel;
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
    item.overrideHeight = 1.1;
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
  ): FlexItem {
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
    const labelW = Math.max(1.0, widthCm - 0.5);
    t.layoutRect = Rect.create(-labelW / 2, labelW / 2, -0.7, 0.7);

    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.alignSelf = FlexAlignSelf.Center;
    item.overrideWidth = widthCm;
    item.overrideHeight = heightCm;
    return item;
  }
}
