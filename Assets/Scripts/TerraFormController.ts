import {
  ClayType,
  FiredVesselSpec,
  KilnShrinkageEngine,
  WetVesselTarget,
} from "./Core/KilnShrinkageEngine";
import {
  ProfileDeltaEvaluator,
  ProfileEvaluationSummary,
  ToleranceStatus,
  VESSEL_ZONE_NAMES,
} from "./Core/ProfileDeltaEvaluator";
import { SeriesConsistencyTracker } from "./Core/SeriesConsistencyTracker";
import { FovNavigationMath } from "./Core/FovNavigationMath";
import {
  LatheMeshGenerator,
  OPTICAL_PALETTE,
  RgbaColor,
} from "./Core/LatheMeshGenerator";
import {
  ClayDeformationState,
  ClayWheelPhysicsEngine,
  HandContactMode,
} from "./Core/ClayWheelPhysicsEngine";
import { ClayViewStudioUI } from "./ClayViewStudioUI";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { DragInteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";

const THEME_FONT = requireAsset("../Fonts/Inter.ttf") as Font;
const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material;
const ICON_ARROW = requireAsset("../Icons/arrow_forward.png") as Texture;
const STABILITY_CHIME_TRACK = requireAsset(
  "../GeneratedSFX/stability_chime.wav"
) as AudioTrackAsset;
const UI_CLICK_TRACK = requireAsset(
  "../GeneratedSFX/ui_click.wav"
) as AudioTrackAsset;

interface ZoneHandleSlot {
  readonly zoneIndex: number;
  readonly name: string;
  readonly heightFraction: number;
  sceneObject: SceneObject;
  interactable: Interactable;
  meshBuilder: MeshBuilder;
  meshVisual: RenderMeshVisual;
}

const ZONE_HEIGHT_FRACTIONS: readonly number[] = [0.06, 0.28, 0.5, 0.74, 0.96];

/**
 * TerraFormController — Thin Lens Studio adapter connecting ClayView's Pure TypeScript Core
 * (`Assets/Scripts/Core/`) to:
 * - Viscoelastic, volume-conserving clay throwing physics (`ClayWheelPhysicsEngine`):
 *   squeezing inward raises height, widening settles height, pulling taller narrows walls,
 *   and neighboring zones flow organically together.
 * - Real SPECS dual-hand contact sculpting (`HandInputData` left & right hands): reach in from
 *   the top cavity to push walls outward, or cup from outside to collar/pull walls taller.
 * - Free 3D Draggable `PotterHandTool` for Interactive Preview: dip inside from the top or
 *   sculpt from the outside with real-time `SculptContactRing` feedback.
 * - 5 interactive radial zone handles + top `ClayHeightHandle` + 4 ceramic vessel presets.
 * - CaliperGaugeLine (`-11, -26, -55` cm), UIKit Studio Card (`+15, -21, -58` cm),
 *   Snap AsrModule voice commands, Spatial Audio chime, and EdgeGuidanceHUD.
 */
@component
export class TerraFormController extends BaseScriptComponent {
  @ui.label('<span style="color: #4AF2FF;">TerraFormController — ClayView Main Adapter</span>')
  @ui.separator
  @ui.group_start("Assets & References")
  @input
  @hint("Vertex color material (vertexBaseColorMaterial from SimpleVertexBaseColor.lspkg)")
  public wireframeMaterial!: Material;

  @input
  @allowUndefined
  @hint("Optional pre-attached ClayViewStudioUI component on StudioCardAnchor")
  public studioUI?: ClayViewStudioUI;
  @ui.group_end

  private currentPresetIndex: number = 0;
  private currentVesselSpec: FiredVesselSpec = KilnShrinkageEngine.getPreset(0);
  private currentClayType: ClayType = "STONEWARE_12";
  private wetTarget: WetVesselTarget = KilnShrinkageEngine.computeWetTarget(
    KilnShrinkageEngine.getPreset(0),
    "STONEWARE_12"
  );

  // Coupled viscoelastic clay state (5 zone offsets in mm + live actual height in cm)
  private clayState: ClayDeformationState = {
    zoneOffsetsMm: [0, 0, 0, 0, 0],
    actualHeightCm: KilnShrinkageEngine.computeWetTarget(
      KilnShrinkageEngine.getPreset(0),
      "STONEWARE_12"
    ).wetHeightCm,
  };

  private seriesTracker: SeriesConsistencyTracker =
    new SeriesConsistencyTracker(6);

  // SceneObject references
  private mainCameraObj: SceneObject | null = null;
  private wheelCenterAnchor: SceneObject | null = null;
  private wheelBatObj: SceneObject | null = null;
  private spinningClayObj: SceneObject | null = null;
  private ghostProfileMeshObj: SceneObject | null = null;
  private caliperGaugeLineObj: SceneObject | null = null;
  private studioCardAnchor: SceneObject | null = null;
  private edgeArrowObj: SceneObject | null = null;

  // All 5 zone handles + top height handle
  private zoneHandles: ZoneHandleSlot[] = [];
  private heightHandleObj: SceneObject | null = null;
  private heightHandleInteractable: Interactable | null = null;
  private heightHandleBuilder: MeshBuilder | null = null;

  // Free 3D PotterHandTool (dip inside from top OR squeeze from outside in Preview!)
  private potterHandToolObj: SceneObject | null = null;
  private potterHandToolInteractable: Interactable | null = null;
  private potterHandToolBuilder: MeshBuilder | null = null;
  private potterHandToolLabel: Text | null = null;
  private potterHandToolLocalPos: vec3 = new vec3(-5.0, 21.5, 0.0);

  // Live glowing horizontal SculptContactRing on the clay at active hand height
  private contactRingObj: SceneObject | null = null;
  private contactRingBuilder: MeshBuilder | null = null;
  private contactRingVisual: RenderMeshVisual | null = null;
  private contactRingFadeTimer: number = 0;

  // Real SPECS Hand Tracking state (left + right hands)
  private handInputData: HandInputData | null = null;
  private prevLeftHandLocal: vec3 | null = null;
  private prevRightHandLocal: vec3 | null = null;

  // Text Component references on CaliperGaugeLine
  private targetHeightText: Text | null = null;
  private actualHeightText: Text | null = null;

  // Procedural MeshBuilder & Visual references
  private ghostMeshBuilder: MeshBuilder | null = null;
  private ghostMeshVisual: RenderMeshVisual | null = null;
  private caliperMeshBuilder: MeshBuilder | null = null;
  private caliperMeshVisual: RenderMeshVisual | null = null;
  private clayMeshBuilder: MeshBuilder | null = null;
  private clayMeshVisual: RenderMeshVisual | null = null;

  // Wheel rotation state
  private wheelSpinAngleRad: number = 0;

  // Stability chime timer state (2.0s all-zones MATCH_TEAL & height on target)
  private tealStableSeconds: number = 0;
  private chimePlayedForCurrentHold: boolean = false;
  private chimeAudioComponent: AudioComponent | null = null;
  private uiClickAudioComponent: AudioComponent | null = null;

  // ASR module handle
  private asrModule: any = null;

  onAwake(): void {
    try {
      this.handInputData = HandInputData.getInstance();
    } catch (_e) {
      this.handInputData = null;
    }

    this.ensureSceneHierarchy();
    this.recomputeAndRefreshVisuals();

    this.createEvent("OnStartEvent").bind(() => {
      this.bindUIHandlesAndVoice();
    });

    this.createEvent("UpdateEvent").bind((eventData) => {
      this.onUpdate(eventData.getDeltaTime());
    });

    this.createEvent("OnDestroyEvent").bind(() => {
      this.stopVoiceRecognition();
    });
  }

  private getActualHeightCm(): number {
    return this.clayState.actualHeightCm;
  }

  private getHeightToleranceStatus(): ToleranceStatus {
    const deltaCm = this.getActualHeightCm() - this.wetTarget.wetHeightCm;
    const absCm = Math.abs(deltaCm);
    if (absCm > 0.8) {
      return deltaCm >= 0 ? "OVER_CORAL" : "UNDER_CORAL";
    }
    if (absCm > 0.4) {
      return "WARN_AMBER";
    }
    return "MATCH_TEAL";
  }

  private ensureSceneHierarchy(): void {
    this.mainCameraObj =
      this.findObjectByName("MainCamera") ||
      this.findObjectByName("Camera Object") ||
      this.findObjectByName("Camera");

    if (this.mainCameraObj && this.mainCameraObj.name !== "MainCamera") {
      this.mainCameraObj.name = "MainCamera";
    }

    // 1. WheelCenterAnchor at (0.0, -26.0, -55.0) cm (downward pitch -25.30 deg)
    this.wheelCenterAnchor = this.getOrCreateRootObject(
      "WheelCenterAnchor",
      new vec3(0.0, -26.0, -55.0)
    );

    // Spatial AudioComponents on WheelCenterAnchor (LowLatency playback)
    this.chimeAudioComponent = this.wheelCenterAnchor.createComponent(
      "Component.AudioComponent"
    ) as AudioComponent;
    this.chimeAudioComponent.audioTrack = STABILITY_CHIME_TRACK;
    this.chimeAudioComponent.volume = 0.75;
    if (typeof Audio !== "undefined" && Audio.PlaybackMode) {
      this.chimeAudioComponent.playbackMode = Audio.PlaybackMode.LowLatency;
    }

    this.uiClickAudioComponent = this.wheelCenterAnchor.createComponent(
      "Component.AudioComponent"
    ) as AudioComponent;
    this.uiClickAudioComponent.audioTrack = UI_CLICK_TRACK;
    this.uiClickAudioComponent.volume = 0.6;
    if (typeof Audio !== "undefined" && Audio.PlaybackMode) {
      this.uiClickAudioComponent.playbackMode = Audio.PlaybackMode.LowLatency;
    }

    // 2. PotteryWheelBat (rotating wheel head platter)
    this.wheelBatObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "PotteryWheelBat",
      new vec3(0.0, 0.0, 0.0)
    );
    this.buildWheelBatMesh();

    // 3. SpinningClayMesh (procedural rotating hollow wet clay vessel stand-in)
    this.spinningClayObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "SpinningClayMesh",
      new vec3(0.0, 0.0, 0.0)
    );

    // 4. GhostProfileMesh (1:1 holographic lathe wireframe: 16 ribs + 6 rings)
    this.ghostProfileMeshObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "GhostProfileMesh",
      new vec3(0.0, 0.0, 0.0)
    );
    this.ghostProfileMeshObj.enabled = true;

    // 5. SculptContactRing (live horizontal highlight ring at active hand contact height)
    this.contactRingObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "SculptContactRing",
      new vec3(0.0, 9.0, 0.0)
    );
    this.contactRingObj.enabled = false;

    // 6. CaliperGaugeLine at (-11.0, -26.0, -55.0) cm (local (-11, 0, 0))
    this.caliperGaugeLineObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "CaliperGaugeLine",
      new vec3(-11.0, 0.0, 0.0)
    );

    const targetHeightObj = this.getOrCreateChildObject(
      this.caliperGaugeLineObj,
      "TargetHeightText",
      new vec3(-0.8, 10.5, 0.0)
    );
    this.targetHeightText = this.getOrCreateText(
      targetHeightObj,
      "18.18 cm",
      24,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );

    const actualHeightObj = this.getOrCreateChildObject(
      this.caliperGaugeLineObj,
      "ActualHeightText",
      new vec3(-0.8, 8.2, 0.0)
    );
    this.actualHeightText = this.getOrCreateText(
      actualHeightObj,
      "Clay: 18.18 cm",
      18,
      new vec4(0.18, 0.9, 0.62, 1.0)
    );

    // 7. All 5 Radial Sculpting Zone Handles (Base, LowerBelly, Belly, Shoulder, Rim)
    this.zoneHandles = [];
    for (let idx = 0; idx < VESSEL_ZONE_NAMES.length; idx++) {
      const zoneName = VESSEL_ZONE_NAMES[idx];
      const handleName = `ClayZoneHandle_${zoneName}`;
      const heightFrac = ZONE_HEIGHT_FRACTIONS[idx];
      const radiusCm = this.wetTarget.wetRadiiMm[idx] / 10.0;
      const handleObj = this.getOrCreateChildObject(
        this.wheelCenterAnchor,
        handleName,
        new vec3(radiusCm + 0.9, this.wetTarget.wetHeightCm * heightFrac, 1.8)
      );
      const isBelly = idx === 2;
      const built = this.setupDiamondHandle(
        handleObj,
        isBelly ? 1.05 : 0.8,
        isBelly ? new vec3(4.0, 3.2, 4.0) : new vec3(3.0, 2.6, 3.0),
        OPTICAL_PALETTE.MATCH_TEAL
      );
      this.zoneHandles.push({
        zoneIndex: idx,
        name: handleName,
        heightFraction: heightFrac,
        sceneObject: handleObj,
        interactable: built.interactable,
        meshBuilder: built.meshBuilder,
        meshVisual: built.meshVisual,
      });
    }

    // 8. Dedicated Top Height Handle (ClayHeightHandle) — drag UP/DOWN to stretch/compress clay
    this.heightHandleObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "ClayHeightHandle",
      new vec3(0.0, this.wetTarget.wetHeightCm + 1.5, 0.0)
    );
    const heightBuilt = this.setupDiamondHandle(
      this.heightHandleObj,
      1.1,
      new vec3(4.2, 3.0, 4.2),
      OPTICAL_PALETTE.CYAN
    );
    this.heightHandleInteractable = heightBuilt.interactable;
    this.heightHandleBuilder = heightBuilt.meshBuilder;

    // 9. Free 3D PotterHandTool — grab & dip INSIDE from top to push outward, or squeeze OUTSIDE!
    this.potterHandToolLocalPos = new vec3(
      -5.2,
      this.wetTarget.wetHeightCm + 2.4,
      0.0
    );
    this.potterHandToolObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "PotterHandTool",
      this.potterHandToolLocalPos
    );
    const handToolBuilt = this.setupDiamondHandle(
      this.potterHandToolObj,
      1.35,
      new vec3(4.6, 4.6, 4.6),
      OPTICAL_PALETTE.WARN_AMBER
    );
    this.potterHandToolInteractable = handToolBuilt.interactable;
    this.potterHandToolBuilder = handToolBuilt.meshBuilder;

    const handLabelObj = this.getOrCreateChildObject(
      this.potterHandToolObj,
      "PotterHandToolLabel",
      new vec3(0.0, 2.0, 0.0)
    );
    this.potterHandToolLabel = this.getOrCreateText(
      handLabelObj,
      "Hand Tool",
      15,
      new vec4(1.0, 0.85, 0.45, 1.0)
    );

    // 10. StudioCardAnchor at (+15.0, -21.0, -58.0) cm (calibrated 9.0 cm width)
    this.studioCardAnchor = this.getOrCreateRootObject(
      "StudioCardAnchor",
      new vec3(15.0, -21.0, -58.0)
    );
    this.studioCardAnchor
      .getTransform()
      .setWorldRotation(quat.fromEulerAngles(0, -12 * MathUtils.DegToRad, 0));

    if (!this.studioUI) {
      const existingUI = this.studioCardAnchor.getComponent(
        ClayViewStudioUI.getTypeName()
      ) as ClayViewStudioUI | null;
      this.studioUI =
        existingUI ||
        (this.studioCardAnchor.createComponent(
          ClayViewStudioUI.getTypeName()
        ) as ClayViewStudioUI);
    }

    // 11. EdgeGuidanceHUD parented to MainCamera at (0, 0, -50) cm
    const edgeHudObj = this.mainCameraObj
      ? this.getOrCreateChildObject(
          this.mainCameraObj,
          "EdgeGuidanceHUD",
          new vec3(0.0, 0.0, -50.0)
        )
      : this.getOrCreateRootObject(
          "EdgeGuidanceHUD",
          new vec3(0.0, 0.0, -50.0)
        );

    this.edgeArrowObj = this.getOrCreateChildObject(
      edgeHudObj,
      "EdgeOfScreenArrow",
      new vec3(-10.0, -6.5, 0.0)
    );
    this.buildEdgeArrowVisual(this.edgeArrowObj);
    this.edgeArrowObj.enabled = false;
  }

  private buildWheelBatMesh(): void {
    if (!this.wheelBatObj) return;
    const geom = LatheMeshGenerator.buildWheelBat(12.0, 1.2, 32);
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "color", components: 4 },
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(geom.vertices);
    builder.appendIndices(geom.indices);

    const rmv =
      (this.wheelBatObj.getComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual) ||
      (this.wheelBatObj.createComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual);
    rmv.mesh = builder.getMesh();
    if (this.wireframeMaterial) {
      rmv.mainMaterial = this.wireframeMaterial;
    }
    builder.updateMesh();
  }

  private setupDiamondHandle(
    handleObj: SceneObject,
    halfSizeCm: number,
    colliderSizeCm: vec3,
    color: RgbaColor
  ): {
    interactable: Interactable;
    meshBuilder: MeshBuilder;
    meshVisual: RenderMeshVisual;
  } {
    const geom = LatheMeshGenerator.buildHandleDiamond(halfSizeCm, color);

    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "color", components: 4 },
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(geom.vertices);
    builder.appendIndices(geom.indices);

    const rmv =
      (handleObj.getComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual) ||
      (handleObj.createComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual);
    rmv.mesh = builder.getMesh();
    if (this.wireframeMaterial) {
      rmv.mainMaterial = this.wireframeMaterial;
    }
    builder.updateMesh();

    let collider = handleObj.getComponent(
      "Physics.ColliderComponent"
    ) as ColliderComponent | null;
    if (!collider) {
      collider = handleObj.createComponent(
        "Physics.ColliderComponent"
      ) as ColliderComponent;
      const boxShape = Shape.createBoxShape();
      boxShape.size = colliderSizeCm;
      collider.shape = boxShape;
    }

    let interactable = handleObj.getComponent(
      Interactable.getTypeName()
    ) as Interactable | null;
    if (!interactable) {
      interactable = handleObj.createComponent(
        Interactable.getTypeName()
      ) as Interactable;
    }

    return { interactable, meshBuilder: builder, meshVisual: rmv };
  }

  private recolorDiamondHandle(
    builder: MeshBuilder,
    halfSizeCm: number,
    color: RgbaColor
  ): void {
    const geom = LatheMeshGenerator.buildHandleDiamond(halfSizeCm, color);
    const vCount = builder.getVerticesCount();
    if (vCount > 0) builder.eraseVertices(0, vCount);
    const iCount = builder.getIndicesCount();
    if (iCount > 0) builder.eraseIndices(0, iCount);
    builder.appendVerticesInterleaved(geom.vertices);
    builder.appendIndices(geom.indices);
    if (builder.isValid()) {
      builder.updateMesh();
    }
  }

  private updateContactRing(
    heightCm: number,
    mode: HandContactMode
  ): void {
    if (!this.contactRingObj || mode === "NONE") return;

    const h = Math.max(1.0, this.getActualHeightCm());
    const t = Math.max(0, Math.min(1, heightCm / h));
    const radiusCm =
      LatheMeshGenerator.interpolateRadiusCm(this.getActualRadiiMm(), t) + 0.35;

    const color =
      mode === "INSIDE_PUSH" || mode === "TOP_OPEN"
        ? OPTICAL_PALETTE.WARN_AMBER
        : OPTICAL_PALETTE.CYAN;

    const segments = 32;
    const verts: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2.0;
      verts.push(
        Math.cos(theta) * radiusCm,
        0,
        Math.sin(theta) * radiusCm,
        color.r,
        color.g,
        color.b,
        0.95
      );
      indices.push(i, (i + 1) % segments);
    }

    if (!this.contactRingBuilder) {
      this.contactRingBuilder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "color", components: 4 },
      ]);
      this.contactRingBuilder.topology = MeshTopology.Lines;
      this.contactRingBuilder.indexType = MeshIndexType.UInt16;
    } else {
      const vc = this.contactRingBuilder.getVerticesCount();
      if (vc > 0) this.contactRingBuilder.eraseVertices(0, vc);
      const ic = this.contactRingBuilder.getIndicesCount();
      if (ic > 0) this.contactRingBuilder.eraseIndices(0, ic);
    }

    this.contactRingBuilder.appendVerticesInterleaved(verts);
    this.contactRingBuilder.appendIndices(indices);

    if (!this.contactRingVisual) {
      this.contactRingVisual =
        (this.contactRingObj.getComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual) ||
        (this.contactRingObj.createComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual);
    }

    if (this.contactRingBuilder.isValid()) {
      this.contactRingVisual.mesh = this.contactRingBuilder.getMesh();
      if (this.wireframeMaterial) {
        this.contactRingVisual.mainMaterial = this.wireframeMaterial;
      }
      this.contactRingBuilder.updateMesh();
    }

    this.contactRingObj
      .getTransform()
      .setLocalPosition(new vec3(0, heightCm, 0));
    this.contactRingObj.enabled = true;
    this.contactRingFadeTimer = 0.45;
  }

  private buildEdgeArrowVisual(arrowObj: SceneObject): void {
    const iconSO = this.getOrCreateChildObject(
      arrowObj,
      "EdgeArrowIcon",
      new vec3(0, 0.8, 0)
    );
    const img =
      (iconSO.getComponent("Component.Image") as Image) ||
      (iconSO.createComponent("Component.Image") as Image);
    const mat = IMAGE_MATERIAL.clone();
    mat.mainPass.baseTex = ICON_ARROW;
    mat.mainPass.baseColor = new vec4(0.29, 0.95, 1.0, 1.0);
    mat.mainPass.depthTest = true;
    mat.mainPass.depthWrite = false;
    img.clearMaterials();
    img.addMaterial(mat);
    iconSO.getTransform().setLocalScale(new vec3(2.8, 2.8, 1));
    iconSO
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(0, 0, Math.PI));

    const labelSO = this.getOrCreateChildObject(
      arrowObj,
      "EdgeArrowLabel",
      new vec3(0, -1.2, 0)
    );
    this.getOrCreateText(
      labelSO,
      "WHEEL",
      18,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );
  }

  private bindUIHandlesAndVoice(): void {
    // 1. Studio Card UI Buttons
    if (this.studioUI) {
      this.studioUI.onCycleShrinkage.add(() => {
        this.playUiClick();
        this.cycleShrinkagePreset();
      });
      this.studioUI.onCyclePreset.add(() => {
        this.playUiClick();
        this.cycleVesselPreset();
      });
      this.studioUI.onSavePiece.add(() => {
        this.playUiClick();
        this.saveCurrentPieceAndAdvance();
      });
      this.studioUI.onToggleWireframe.add(() => {
        this.playUiClick();
        this.toggleWireframeVisibility();
      });
      this.studioUI.onResetClay.add(() => {
        this.playUiClick();
        this.resetClayDeformation();
      });
    }

    // 2. All 5 Radial Zone Sculpting Handles (now coupled via ClayWheelPhysicsEngine!)
    for (let i = 0; i < this.zoneHandles.length; i++) {
      const slot = this.zoneHandles[i];
      slot.interactable.onDragUpdate.add((event: DragInteractorEvent) => {
        const dragVec = event.dragVector;
        if (!dragVec) return;

        // Horizontal X drag applies radial clay force -> couples neighbors + conserves volume!
        const deltaMm = dragVec.x * 1.8;
        this.clayState = ClayWheelPhysicsEngine.applyRadialForce(
          this.wetTarget.wetRadiiMm,
          this.clayState,
          slot.zoneIndex,
          deltaMm
        );

        // Vertical Y drag on Rim (or upward pull on any wall zone) pulls clay taller/shorter!
        if (Math.abs(dragVec.y) > 0.002) {
          const vScale = slot.zoneIndex === 4 ? 0.28 : 0.14;
          this.clayState = ClayWheelPhysicsEngine.applyVerticalForce(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            dragVec.y * vScale
          );
        }

        this.updateContactRing(
          this.getActualHeightCm() * slot.heightFraction,
          deltaMm >= 0 ? "INSIDE_PUSH" : "OUTSIDE_SQUEEZE"
        );
        this.recomputeAndRefreshVisuals();
      });
    }

    // 3. Top Center ClayHeightHandle (volume-conserving vertical pull/compress)
    if (this.heightHandleInteractable) {
      this.heightHandleInteractable.onDragUpdate.add(
        (event: DragInteractorEvent) => {
          const dragVec = event.dragVector;
          if (!dragVec) return;
          this.clayState = ClayWheelPhysicsEngine.applyVerticalForce(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            dragVec.y * 0.3
          );
          this.updateContactRing(this.getActualHeightCm(), "TOP_OPEN");
          this.recomputeAndRefreshVisuals();
        }
      );
    }

    // 4. Free 3D PotterHandTool — dip INSIDE from top to push outward, or squeeze from OUTSIDE!
    if (this.potterHandToolInteractable) {
      this.potterHandToolInteractable.onDragUpdate.add(
        (event: DragInteractorEvent) => {
          const dragVec = event.dragVector;
          if (!dragVec || !this.potterHandToolObj) return;

          const moveScale = 0.65;
          const dx = dragVec.x * moveScale;
          const dy = dragVec.y * moveScale;

          const nextX = Math.max(
            -13.5,
            Math.min(13.5, this.potterHandToolLocalPos.x + dx)
          );
          const nextY = Math.max(
            0.6,
            Math.min(26.5, this.potterHandToolLocalPos.y + dy)
          );
          this.potterHandToolLocalPos = new vec3(nextX, nextY, 0.0);
          this.potterHandToolObj
            .getTransform()
            .setLocalPosition(this.potterHandToolLocalPos);

          const contact = ClayWheelPhysicsEngine.applyHandToolContact(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            { x: nextX, y: nextY, z: 0.0 },
            { x: dx, y: dy, z: 0.0 },
            1.4
          );

          this.updatePotterHandToolVisual(contact.mode);

          if (contact.deformed) {
            this.clayState = contact.state;
            this.updateContactRing(contact.contactHeightCm, contact.mode);
            this.recomputeAndRefreshVisuals();
          } else if (contact.mode !== "NONE") {
            this.updateContactRing(contact.contactHeightCm, contact.mode);
          }
        }
      );

      this.potterHandToolInteractable.onDragEnd.add(() => {
        this.updatePotterHandToolVisual("NONE");
      });
    }

    // 5. Hands-Free ASR Voice Commands
    this.initVoiceRecognition();
  }

  private updatePotterHandToolVisual(mode: HandContactMode): void {
    if (this.potterHandToolBuilder) {
      const color =
        mode === "INSIDE_PUSH"
          ? OPTICAL_PALETTE.WARN_AMBER
          : mode === "OUTSIDE_SQUEEZE"
          ? OPTICAL_PALETTE.CYAN
          : mode === "TOP_OPEN"
          ? OPTICAL_PALETTE.MATCH_TEAL
          : OPTICAL_PALETTE.IVORY;
      this.recolorDiamondHandle(this.potterHandToolBuilder, 1.35, color);
    }

    if (this.potterHandToolLabel) {
      switch (mode) {
        case "INSIDE_PUSH":
          this.potterHandToolLabel.text = "INSIDE PUSH";
          break;
        case "OUTSIDE_SQUEEZE":
          this.potterHandToolLabel.text = "OUTSIDE SQUEEZE";
          break;
        case "TOP_OPEN":
          this.potterHandToolLabel.text = "OPEN CAVITY";
          break;
        default:
          this.potterHandToolLabel.text = "Hand Tool";
          break;
      }
    }
  }

  private processRealHandTracking(): void {
    if (!this.handInputData || !this.wheelCenterAnchor) return;
    const anchorWorld = this.wheelCenterAnchor.getTransform().getWorldPosition();

    const processOneHand = (
      handSide: "left" | "right",
      prevLocal: vec3 | null
    ): vec3 | null => {
      try {
        const hand = this.handInputData!.getHand(handSide);
        if (!hand || !hand.isTracked()) return null;

        // Midpoint of index & thumb tips gives natural potter finger-pad contact point
        const idxPos = hand.indexTip.position;
        const thmPos = hand.thumbTip.position;
        const tipWorld = idxPos.add(thmPos).uniformScale(0.5);
        const localPos = tipWorld.sub(anchorWorld);

        if (prevLocal) {
          const vel = localPos.sub(prevLocal);
          const contact = ClayWheelPhysicsEngine.applyHandToolContact(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            { x: localPos.x, y: localPos.y, z: localPos.z },
            { x: vel.x, y: vel.y, z: vel.z },
            1.6
          );
          if (contact.deformed) {
            this.clayState = contact.state;
            this.updateContactRing(contact.contactHeightCm, contact.mode);
            this.recomputeAndRefreshVisuals();
          }
        }
        return localPos;
      } catch (_e) {
        return null;
      }
    };

    this.prevLeftHandLocal = processOneHand("left", this.prevLeftHandLocal);
    this.prevRightHandLocal = processOneHand("right", this.prevRightHandLocal);
  }

  private playUiClick(): void {
    if (this.uiClickAudioComponent && this.uiClickAudioComponent.audioTrack) {
      this.uiClickAudioComponent.play(1);
    }
  }

  private initVoiceRecognition(): void {
    try {
      this.asrModule = require("LensStudio:AsrModule");
      if (!this.asrModule || typeof AsrModule === "undefined") return;

      const options = AsrModule.AsrTranscriptionOptions.create();
      options.silenceUntilTerminationMs = 1000;
      options.mode = AsrModule.AsrMode.HighAccuracy;

      options.onTranscriptionUpdateEvent.add(
        (eventArgs: AsrModule.TranscriptionUpdateEvent) => {
          if (eventArgs.isFinal && eventArgs.text) {
            this.handleVoiceTranscript(eventArgs.text);
          }
        }
      );

      options.onTranscriptionErrorEvent.add(
        (_errorCode: AsrModule.AsrStatusCode) => {
          // Offline / Desktop Preview gracefully relies on 1:1 SIK UI buttons
        }
      );

      this.asrModule.startTranscribing(options);
    } catch (_e) {
      // AsrModule unavailable in non-Spectacles environment
    }
  }

  private stopVoiceRecognition(): void {
    try {
      if (
        this.asrModule &&
        typeof this.asrModule.stopTranscribing === "function"
      ) {
        this.asrModule.stopTranscribing();
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  }

  public handleVoiceTranscript(rawTranscript: string): void {
    const normalized = rawTranscript.toLowerCase().trim();
    if (
      normalized.includes("next piece") ||
      normalized.includes("save piece")
    ) {
      this.playUiClick();
      this.saveCurrentPieceAndAdvance();
    } else if (
      normalized.includes("toggle wireframe") ||
      normalized.includes("hide wireframe") ||
      normalized.includes("show wireframe")
    ) {
      this.playUiClick();
      this.toggleWireframeVisibility();
    } else if (
      normalized.includes("set porcelain") ||
      normalized.includes("clay porcelain")
    ) {
      this.playUiClick();
      this.setShrinkagePreset("PORCELAIN_14");
    } else if (
      normalized.includes("next shape") ||
      normalized.includes("change shape")
    ) {
      this.playUiClick();
      this.cycleVesselPreset();
    } else if (normalized.includes("reset clay")) {
      this.playUiClick();
      this.resetClayDeformation();
    }
  }

  public cycleShrinkagePreset(): void {
    const nextType = KilnShrinkageEngine.nextClayType(this.currentClayType);
    this.setShrinkagePreset(nextType);
  }

  public setShrinkagePreset(clayType: ClayType): void {
    const prevTargetHeight = this.wetTarget.wetHeightCm;
    const heightDelta = this.clayState.actualHeightCm - prevTargetHeight;
    this.currentClayType = clayType;
    this.wetTarget = KilnShrinkageEngine.computeWetTarget(
      this.currentVesselSpec,
      this.currentClayType
    );
    this.clayState = {
      zoneOffsetsMm: this.clayState.zoneOffsetsMm,
      actualHeightCm: Math.max(
        ClayWheelPhysicsEngine.MIN_HEIGHT_CM,
        Math.min(
          ClayWheelPhysicsEngine.MAX_HEIGHT_CM,
          this.wetTarget.wetHeightCm + heightDelta
        )
      ),
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleVesselPreset(): void {
    this.currentPresetIndex = KilnShrinkageEngine.nextPresetIndex(
      this.currentPresetIndex
    );
    this.currentVesselSpec = KilnShrinkageEngine.getPreset(
      this.currentPresetIndex
    );
    this.wetTarget = KilnShrinkageEngine.computeWetTarget(
      this.currentVesselSpec,
      this.currentClayType
    );
    this.resetClayDeformation();
  }

  public resetClayDeformation(): void {
    this.clayState = {
      zoneOffsetsMm: [0, 0, 0, 0, 0],
      actualHeightCm: this.wetTarget.wetHeightCm,
    };
    this.tealStableSeconds = 0;
    this.chimePlayedForCurrentHold = false;
    this.potterHandToolLocalPos = new vec3(
      -5.2,
      this.wetTarget.wetHeightCm + 2.4,
      0.0
    );
    if (this.potterHandToolObj) {
      this.potterHandToolObj
        .getTransform()
        .setLocalPosition(this.potterHandToolLocalPos);
    }
    this.updatePotterHandToolVisual("NONE");
    if (this.contactRingObj) {
      this.contactRingObj.enabled = false;
    }
    this.recomputeAndRefreshVisuals();
  }

  public saveCurrentPieceAndAdvance(): void {
    const summary = this.evaluateCurrentProfile();
    this.seriesTracker.recordPiece(
      this.computeCombinedMatchPercentage(summary),
      summary.maxDeviationMm,
      this.currentClayType
    );

    this.resetClayDeformation();
  }

  public toggleWireframeVisibility(): void {
    if (this.ghostProfileMeshObj) {
      this.ghostProfileMeshObj.enabled = !this.ghostProfileMeshObj.enabled;
    }
  }

  private onUpdate(dt: number): void {
    // 1. Spin wheel bat & wet clay mesh continuously
    this.wheelSpinAngleRad =
      (this.wheelSpinAngleRad + dt * 1.6) % (Math.PI * 2);
    const spinQuat = quat.fromEulerAngles(0, this.wheelSpinAngleRad, 0);
    if (this.wheelBatObj) {
      this.wheelBatObj.getTransform().setLocalRotation(spinQuat);
    }
    if (this.spinningClayObj) {
      this.spinningClayObj.getTransform().setLocalRotation(spinQuat);
    }

    // 2. Real SPECS bare-hand sculpting (inside push & outside squeeze)
    this.processRealHandTracking();

    // 3. Auto-hide SculptContactRing briefly after hand leaves clay
    if (this.contactRingFadeTimer > 0) {
      this.contactRingFadeTimer -= dt;
      if (this.contactRingFadeTimer <= 0 && this.contactRingObj) {
        this.contactRingObj.enabled = false;
      }
    }

    // 4. Stability chime timer: play once after 2.0s continuous MATCH_TEAL across all 5 zones + height
    const summary = this.evaluateCurrentProfile();
    const heightStable = this.getHeightToleranceStatus() === "MATCH_TEAL";
    if (summary.allZonesStable && heightStable) {
      this.tealStableSeconds += dt;
      if (this.tealStableSeconds >= 2.0 && !this.chimePlayedForCurrentHold) {
        this.chimePlayedForCurrentHold = true;
        if (this.chimeAudioComponent && this.chimeAudioComponent.audioTrack) {
          this.chimeAudioComponent.play(1);
        }
      }
    } else {
      this.tealStableSeconds = 0;
      this.chimePlayedForCurrentHold = false;
    }

    // 5. Off-Screen Navigation check (DC-5: > 16.0 deg horizontal yaw away from WheelCenterAnchor)
    this.updateOffscreenGuidance();
  }

  private updateOffscreenGuidance(): void {
    if (!this.mainCameraObj || !this.wheelCenterAnchor || !this.edgeArrowObj) {
      return;
    }

    const camTransform = this.mainCameraObj.getTransform();
    const camPos = camTransform.getWorldPosition();
    const camBack = camTransform.back;
    const anchorPos = this.wheelCenterAnchor.getTransform().getWorldPosition();

    const evalResult = FovNavigationMath.evaluateGazeOffset(
      { x: camPos.x, y: camPos.y, z: camPos.z },
      { x: camBack.x, y: camBack.y, z: camBack.z },
      { x: anchorPos.x, y: anchorPos.y, z: anchorPos.z },
      FovNavigationMath.OFFSCREEN_THRESHOLD_DEG
    );

    if (this.edgeArrowObj.enabled !== evalResult.isOffscreen) {
      this.edgeArrowObj.enabled = evalResult.isOffscreen;
    }
  }

  private evaluateCurrentProfile(): ProfileEvaluationSummary {
    const actualRadiiMm = this.getActualRadiiMm();
    return ProfileDeltaEvaluator.evaluateProfile(
      this.wetTarget.wetRadiiMm,
      actualRadiiMm
    );
  }

  private computeCombinedMatchPercentage(
    summary: ProfileEvaluationSummary
  ): number {
    const heightStatus = this.getHeightToleranceStatus();
    if (heightStatus === "MATCH_TEAL") {
      return summary.matchPercentage;
    }
    const heightPenalty = heightStatus === "WARN_AMBER" ? 6 : 14;
    return Math.max(0, summary.matchPercentage - heightPenalty);
  }

  private getActualRadiiMm(): number[] {
    return this.wetTarget.wetRadiiMm.map((targetR, idx) =>
      Math.max(
        ClayWheelPhysicsEngine.MIN_RADIUS_MM,
        targetR + this.clayState.zoneOffsetsMm[idx]
      )
    );
  }

  private recomputeAndRefreshVisuals(): void {
    const summary = this.evaluateCurrentProfile();
    const bellyStatus = summary.zones[2].status;
    const zoneStatuses = summary.zones.map((z) => z.status);
    const actualHeightCm = this.getActualHeightCm();
    const heightStatus = this.getHeightToleranceStatus();
    const combinedMatch = this.computeCombinedMatchPercentage(summary);

    // Update CaliperGaugeLine height texts
    if (this.targetHeightText) {
      this.targetHeightText.text = KilnShrinkageEngine.formatHeightCm(
        this.wetTarget.wetHeightCm,
        2
      );
    }

    if (this.actualHeightText) {
      const hDiff = actualHeightCm - this.wetTarget.wetHeightCm;
      const diffSuffix =
        Math.abs(hDiff) > 0.05
          ? ` (${hDiff >= 0 ? "+" : ""}${hDiff.toFixed(1)})`
          : "";
      this.actualHeightText.text = `Clay: ${actualHeightCm.toFixed(2)} cm${diffSuffix}`;
      if (this.actualHeightText.textFill) {
        this.actualHeightText.textFill.color =
          this.statusToVec4(heightStatus);
      }
    }

    // Reposition & recolor all 5 radial zone handles along the live clay silhouette
    const actualRadiiMm = this.getActualRadiiMm();
    for (let i = 0; i < this.zoneHandles.length; i++) {
      const slot = this.zoneHandles[i];
      const radiusCm = actualRadiiMm[i] / 10.0;
      slot.sceneObject
        .getTransform()
        .setLocalPosition(
          new vec3(radiusCm + 0.9, actualHeightCm * slot.heightFraction, 1.8)
        );
      const handleColor = LatheMeshGenerator.colorForToleranceStatus(
        zoneStatuses[i],
        OPTICAL_PALETTE.MATCH_TEAL
      );
      this.recolorDiamondHandle(
        slot.meshBuilder,
        i === 2 ? 1.05 : 0.8,
        handleColor
      );
    }

    // Reposition & recolor top ClayHeightHandle above the live rim
    if (this.heightHandleObj && this.heightHandleBuilder) {
      this.heightHandleObj
        .getTransform()
        .setLocalPosition(new vec3(0.0, actualHeightCm + 1.5, 0.0));
      const heightColor =
        heightStatus === "MATCH_TEAL"
          ? OPTICAL_PALETTE.CYAN
          : LatheMeshGenerator.colorForToleranceStatus(heightStatus);
      this.recolorDiamondHandle(this.heightHandleBuilder, 1.1, heightColor);
    }

    // Update UIKit Studio Card HUD
    if (this.studioUI) {
      this.studioUI.updateMetrics(
        KilnShrinkageEngine.getDisplayLabel(this.currentClayType),
        this.seriesTracker.getCounterLabel(),
        bellyStatus,
        combinedMatch,
        this.currentVesselSpec.presetName
      );
    }

    this.rebuildGhostWireframeMesh(bellyStatus, zoneStatuses);
    this.rebuildCaliperGaugeMesh(actualHeightCm, heightStatus);
    this.rebuildSpinningClayMesh(actualHeightCm);
  }

  private statusToVec4(status: ToleranceStatus): vec4 {
    switch (status) {
      case "MATCH_TEAL":
        return new vec4(0.18, 0.9, 0.62, 1.0);
      case "WARN_AMBER":
        return new vec4(1.0, 0.78, 0.34, 1.0);
      case "OVER_CORAL":
      case "UNDER_CORAL":
        return new vec4(1.0, 0.42, 0.42, 1.0);
    }
  }

  private rebuildGhostWireframeMesh(
    bellyStatus: ToleranceStatus,
    zoneStatuses: readonly ToleranceStatus[]
  ): void {
    if (!this.ghostProfileMeshObj) return;

    const baseRibColor: RgbaColor =
      this.currentClayType === "PORCELAIN_14"
        ? OPTICAL_PALETTE.CYAN
        : OPTICAL_PALETTE.IVORY;

    const ringColor: RgbaColor =
      bellyStatus === "MATCH_TEAL"
        ? OPTICAL_PALETTE.MATCH_TEAL
        : OPTICAL_PALETTE.CYAN;

    const geom = LatheMeshGenerator.buildWireframe(
      this.wetTarget.wetHeightCm,
      this.wetTarget.wetRadiiMm,
      baseRibColor,
      ringColor,
      LatheMeshGenerator.DEFAULT_RIB_COUNT,
      LatheMeshGenerator.DEFAULT_RING_COUNT,
      zoneStatuses
    );

    if (!this.ghostMeshBuilder) {
      this.ghostMeshBuilder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "color", components: 4 },
      ]);
      this.ghostMeshBuilder.topology = MeshTopology.Lines;
      this.ghostMeshBuilder.indexType = MeshIndexType.UInt16;
    } else {
      const vCount = this.ghostMeshBuilder.getVerticesCount();
      if (vCount > 0) this.ghostMeshBuilder.eraseVertices(0, vCount);
      const iCount = this.ghostMeshBuilder.getIndicesCount();
      if (iCount > 0) this.ghostMeshBuilder.eraseIndices(0, iCount);
    }

    this.ghostMeshBuilder.appendVerticesInterleaved(geom.vertices);
    this.ghostMeshBuilder.appendIndices(geom.indices);

    if (!this.ghostMeshVisual) {
      this.ghostMeshVisual =
        (this.ghostProfileMeshObj.getComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual) ||
        (this.ghostProfileMeshObj.createComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual);
    }

    if (this.ghostMeshBuilder.isValid()) {
      this.ghostMeshVisual.mesh = this.ghostMeshBuilder.getMesh();
      if (this.wireframeMaterial) {
        this.ghostMeshVisual.mainMaterial = this.wireframeMaterial;
      }
      this.ghostMeshBuilder.updateMesh();
    }
  }

  private rebuildCaliperGaugeMesh(
    actualHeightCm: number,
    heightStatus: ToleranceStatus
  ): void {
    if (!this.caliperGaugeLineObj) return;
    const actualColor = LatheMeshGenerator.colorForToleranceStatus(
      heightStatus,
      OPTICAL_PALETTE.MATCH_TEAL
    );
    const geom = LatheMeshGenerator.buildCaliperGauge(
      this.wetTarget.wetHeightCm,
      OPTICAL_PALETTE.CYAN,
      actualHeightCm,
      actualColor
    );

    if (!this.caliperMeshBuilder) {
      this.caliperMeshBuilder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "color", components: 4 },
      ]);
      this.caliperMeshBuilder.topology = MeshTopology.Lines;
      this.caliperMeshBuilder.indexType = MeshIndexType.UInt16;
    } else {
      const vCount = this.caliperMeshBuilder.getVerticesCount();
      if (vCount > 0) this.caliperMeshBuilder.eraseVertices(0, vCount);
      const iCount = this.caliperMeshBuilder.getIndicesCount();
      if (iCount > 0) this.caliperMeshBuilder.eraseIndices(0, iCount);
    }

    this.caliperMeshBuilder.appendVerticesInterleaved(geom.vertices);
    this.caliperMeshBuilder.appendIndices(geom.indices);

    if (!this.caliperMeshVisual) {
      this.caliperMeshVisual =
        (this.caliperGaugeLineObj.getComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual) ||
        (this.caliperGaugeLineObj.createComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual);
    }

    if (this.caliperMeshBuilder.isValid()) {
      this.caliperMeshVisual.mesh = this.caliperMeshBuilder.getMesh();
      if (this.wireframeMaterial) {
        this.caliperMeshVisual.mainMaterial = this.wireframeMaterial;
      }
      this.caliperMeshBuilder.updateMesh();
    }
  }

  private rebuildSpinningClayMesh(actualHeightCm: number): void {
    if (!this.spinningClayObj) return;
    const clayColor =
      this.currentClayType === "PORCELAIN_14"
        ? OPTICAL_PALETTE.CLAY_PORCELAIN
        : OPTICAL_PALETTE.CLAY_STONEWARE;

    const geom = LatheMeshGenerator.buildSolidVessel(
      actualHeightCm,
      this.getActualRadiiMm(),
      clayColor
    );

    if (!this.clayMeshBuilder) {
      this.clayMeshBuilder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "normal", components: 3, normalized: true },
        { name: "color", components: 4 },
      ]);
      this.clayMeshBuilder.topology = MeshTopology.Triangles;
      this.clayMeshBuilder.indexType = MeshIndexType.UInt16;
    } else {
      const vCount = this.clayMeshBuilder.getVerticesCount();
      if (vCount > 0) this.clayMeshBuilder.eraseVertices(0, vCount);
      const iCount = this.clayMeshBuilder.getIndicesCount();
      if (iCount > 0) this.clayMeshBuilder.eraseIndices(0, iCount);
    }

    this.clayMeshBuilder.appendVerticesInterleaved(geom.vertices);
    this.clayMeshBuilder.appendIndices(geom.indices);

    if (!this.clayMeshVisual) {
      this.clayMeshVisual =
        (this.spinningClayObj.getComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual) ||
        (this.spinningClayObj.createComponent(
          "Component.RenderMeshVisual"
        ) as RenderMeshVisual);
    }

    if (this.clayMeshBuilder.isValid()) {
      this.clayMeshVisual.mesh = this.clayMeshBuilder.getMesh();
      if (this.wireframeMaterial) {
        this.clayMeshVisual.mainMaterial = this.wireframeMaterial;
      }
      this.clayMeshBuilder.updateMesh();
    }
  }

  private getOrCreateRootObject(name: string, worldPos: vec3): SceneObject {
    let obj = this.findObjectByName(name);
    if (!obj) {
      obj = global.scene.createSceneObject(name);
    }
    obj.getTransform().setWorldPosition(worldPos);
    return obj;
  }

  private getOrCreateChildObject(
    parent: SceneObject,
    name: string,
    localPos: vec3
  ): SceneObject {
    for (let i = 0; i < parent.getChildrenCount(); i++) {
      const child = parent.getChild(i);
      if (child.name === name) {
        child.getTransform().setLocalPosition(localPos);
        return child;
      }
    }
    const created = global.scene.createSceneObject(name);
    created.setParent(parent);
    created.getTransform().setLocalPosition(localPos);
    return created;
  }

  private getOrCreateText(
    obj: SceneObject,
    initialText: string,
    size: number,
    color: vec4
  ): Text {
    let textComp = obj.getComponent("Component.Text") as Text | null;
    if (!textComp) {
      textComp = obj.createComponent("Component.Text") as Text;
    }
    textComp.text = initialText;
    textComp.font = THEME_FONT;
    textComp.size = size;
    textComp.depthTest = true;
    textComp.horizontalAlignment = HorizontalAlignment.Center;
    textComp.verticalAlignment = VerticalAlignment.Center;
    textComp.horizontalOverflow = HorizontalOverflow.Overflow;
    textComp.verticalOverflow = VerticalOverflow.Overflow;
    if (textComp.textFill) {
      textComp.textFill.color = color;
    }
    return textComp;
  }

  private findObjectByName(name: string): SceneObject | null {
    const rootCount = global.scene.getRootObjectsCount();
    for (let i = 0; i < rootCount; i++) {
      const found = this.searchTree(global.scene.getRootObject(i), name);
      if (found) return found;
    }
    return null;
  }

  private searchTree(node: SceneObject, name: string): SceneObject | null {
    if (node.name === name) return node;
    const count = node.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const res = this.searchTree(node.getChild(i), name);
      if (res) return res;
    }
    return null;
  }
}
