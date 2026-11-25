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
import {
  ClayMassId,
  ClayStudioFlowEngine,
  OrbitalBasis,
} from "./Core/ClayStudioFlowEngine";
import {
  CeramicWorkflowStage,
  ClayBodyId,
  FiringScheduleParams,
  GlazeCteFitMode,
  HandBuildingProcessParams,
  MOISTURE_STATE_ORDER,
  SimulationResult,
  SurfaceTreatmentSelection,
} from "./Core/CeramicMaterialTypes";
import {
  CLAY_BODY_CATALOG,
  CLAY_BODY_ORDER,
  FIRING_METHOD_CATALOG,
  FIRING_METHOD_ORDER,
  GLAZE_APPLICATION_CATALOG,
  GLAZE_METHOD_ORDER,
  HAND_BUILDING_CATALOG,
  HAND_BUILDING_ORDER,
  SURFACE_TREATMENT_CATALOG,
  SURFACE_TREATMENT_ORDER,
  nextInOrder,
} from "./Core/CeramicMaterialCatalog";
import { CeramicCompatibilityEngine } from "./Core/CeramicCompatibilityEngine";
import {
  FREEFORM_PRESET_ORDER,
  FreeformClayField,
  FreeformSculptPreset,
} from "./Core/FreeformClayField";
import { CeramicModalPanel } from "./CeramicModalPanel";
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

  // 5-Stage Sequential Ceramic Materials Workflow:
  // 1. SELECT_CLAY_BODY -> 2. SHAPING_HANDBUILDING (MAIN FOCUS)
  // -> [Dekorasi] 3. DECORATION_OPTIONS -> [Pembakaran] 4. FIRING_OPTIONS -> 5. FINAL_RESULT
  private workflowStage: CeramicWorkflowStage = "SELECT_CLAY_BODY";
  private selectedClayBody: ClayBodyId = "STONEWARE";
  private selectedClayMass: ClayMassId = "MEDIUM_900G";

  private handBuildingParams: HandBuildingProcessParams = {
    technique: "PINCHING",
    moistureState: "plastic",
    vesselScale: "bowl",
    rimThicknessMm: 5.0,
    wallThicknessMm: 6.0,
    baseThicknessMm: 7.5,
    scoreAndSlipApplied: true,
    compressedOrPaddled: true,
    bidirectionalSlabRolled: true,
    moistureMismatchBetweenLayers: false,
    dryingRate: "slow",
  };

  private surfaceSelection: SurfaceTreatmentSelection = {
    surfaceTreatment: "NONE",
    glazeMethod: "NONE",
    glazeCteFit: "OPTIMAL",
    slipMatchesBody: true,
    appliedAtMoisture: "leather-hard",
    rawGlazeAttempted: false,
    coarseGrogBody: false,
  };

  private firingParams: FiringScheduleParams = {
    method: "ELECTRIC_OXIDATION",
    useElectricKilnHost: false,
    heatingRate: "medium",
    coolingRate: "controlled",
    candlingComplete: true,
    lowBisqueCone: false,
    ventilationActive: true,
  };

  private lastEvaluation: SimulationResult | null = null;

  // 2D Polar Freeform 3D Sculpting Field (asymmetric wiggle rims, spouts, dips, lotus waves, local pinches!)
  private freeformField: FreeformClayField = new FreeformClayField();
  private nextFreeformPreset: FreeformSculptPreset = "WIGGLE_RIM";

  // 360-degree camera-following orbital basis around WheelCenterAnchor
  private currentOrbitalBasis: OrbitalBasis = {
    toCamX: 0,
    toCamZ: 1,
    rightX: 1,
    rightZ: 0,
    yawRad: 0,
  };

  // Coupled viscoelastic clay state — starts as a raw rounded Globe Piece mound!
  private clayState: ClayDeformationState =
    ClayStudioFlowEngine.buildGlobePieceState(
      KilnShrinkageEngine.computeWetTarget(
        KilnShrinkageEngine.getPreset(0),
        "STONEWARE_12"
      ).wetRadiiMm,
      "MEDIUM_900G"
    );

  private seriesTracker: SeriesConsistencyTracker =
    new SeriesConsistencyTracker(6);

  // SceneObject references
  private mainCameraObj: SceneObject | null = null;
  private wheelCenterAnchor: SceneObject | null = null;
  private wheelBatObj: SceneObject | null = null;
  private tableReticleObj: SceneObject | null = null;
  private tableReticleLabel: Text | null = null;
  private tableReticlePulsePhase: number = 0;
  private spinningClayObj: SceneObject | null = null;
  private ghostProfileMeshObj: SceneObject | null = null;
  private caliperGaugeLineObj: SceneObject | null = null;
  private studioCardAnchor: SceneObject | null = null;
  private modalAnchor: SceneObject | null = null;
  private modalPanel: CeramicModalPanel | null = null;
  private edgeArrowObj: SceneObject | null = null;

  // Optional WorldQueryModule hit-test session for SPECS table detection (Step 1)
  private worldQueryModule: any = null;
  private hitTestSession: any = null;
  private worldQueryCooldownSec: number = 0;

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
  private potterToolPlaneX: number = -5.2;
  private potterToolPlaneY: number = 14.0;

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
    this.initTableWorldQuery();
    this.updateOrbitalCameraLayout();
    this.recomputeAndRefreshVisuals();

    this.createEvent("OnStartEvent").bind(() => {
      this.bindUIHandlesAndVoice();
    });

    this.createEvent("UpdateEvent").bind((eventData) => {
      this.onUpdate(eventData.getDeltaTime());
    });

    this.createEvent("OnDestroyEvent").bind(() => {
      this.stopVoiceRecognition();
      this.stopTableWorldQuery();
    });
  }

  private getActualHeightCm(): number {
    return this.clayState.actualHeightCm;
  }

  private getCurrentMaxHeightCm(): number {
    return ClayStudioFlowEngine.getMassPreset(this.selectedClayMass)
      .maxHeightCm;
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

    // 2b. TableReticleRing (Step 1: DETECT_TABLE glowing table placement guide)
    this.tableReticleObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "TableReticleRing",
      new vec3(0.0, 0.0, 0.0)
    );
    this.buildTableReticleMesh();
    const reticleLabelObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "TableReticleLabel",
      new vec3(0.0, 2.0, 12.0)
    );
    this.tableReticleLabel = this.getOrCreateText(
      reticleLabelObj,
      "STEP 1: PILIH CLAY BODY · MULAI SHAPING",
      15,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );

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
    this.potterToolPlaneX = -5.2;
    this.potterToolPlaneY = this.clayState.actualHeightCm + 3.2;
    this.potterHandToolObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "PotterHandTool",
      new vec3(this.potterToolPlaneX, this.potterToolPlaneY, 0.0)
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

    // 10. StudioCardAnchor (orbits 360 deg around WheelCenterAnchor to face MainCamera)
    this.studioCardAnchor = this.getOrCreateRootObject(
      "StudioCardAnchor",
      new vec3(15.0, -17.5, -58.0)
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

    // 10b. CeramicModalAnchor (Secondary Modal Panel for Decoration / Firing / Result)
    this.modalAnchor = this.getOrCreateRootObject(
      "CeramicModalAnchor",
      new vec3(-14.2, -15.5, -56.0)
    );
    this.modalAnchor
      .getTransform()
      .setWorldRotation(quat.fromEulerAngles(0, 12 * MathUtils.DegToRad, 0));
    const existingModal = this.modalAnchor.getComponent(
      CeramicModalPanel.getTypeName()
    ) as CeramicModalPanel | null;
    this.modalPanel =
      existingModal ||
      (this.modalAnchor.createComponent(
        CeramicModalPanel.getTypeName()
      ) as CeramicModalPanel);
    this.modalAnchor.enabled = false;

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

  private buildTableReticleMesh(): void {
    if (!this.tableReticleObj) return;
    const geom = LatheMeshGenerator.buildTableReticle(
      14.5,
      9.5,
      OPTICAL_PALETTE.CYAN
    );
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "color", components: 4 },
    ]);
    builder.topology = MeshTopology.Lines;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(geom.vertices);
    builder.appendIndices(geom.indices);

    const rmv =
      (this.tableReticleObj.getComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual) ||
      (this.tableReticleObj.createComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual);
    rmv.mesh = builder.getMesh();
    if (this.wireframeMaterial) {
      rmv.mainMaterial = this.wireframeMaterial;
    }
    builder.updateMesh();
  }

  private initTableWorldQuery(): void {
    try {
      this.worldQueryModule = require("LensStudio:WorldQueryModule");
      if (
        this.worldQueryModule &&
        typeof HitTestSessionOptions !== "undefined"
      ) {
        const opts = HitTestSessionOptions.create();
        opts.filter = true;
        this.hitTestSession =
          this.worldQueryModule.createHitTestSessionWithOptions(opts);
        if (this.hitTestSession && typeof this.hitTestSession.start === "function") {
          this.hitTestSession.start();
        }
      }
    } catch (_e) {
      // Interactive Preview gracefully uses the calibrated preview table stand-in
      this.worldQueryModule = null;
      this.hitTestSession = null;
    }
  }

  private pollTableWorldQuery(dt: number): void {
    if (
      this.workflowStage !== "SELECT_CLAY_BODY" ||
      !this.hitTestSession ||
      !this.mainCameraObj ||
      !this.wheelCenterAnchor
    ) {
      return;
    }
    this.worldQueryCooldownSec -= dt;
    if (this.worldQueryCooldownSec > 0) return;
    this.worldQueryCooldownSec = 0.15;

    try {
      const camT = this.mainCameraObj.getTransform();
      const rayStart = camT.getWorldPosition();
      const rayEnd = rayStart.add(camT.back.uniformScale(140.0));
      this.hitTestSession.hitTest(rayStart, rayEnd, (hitResult: any) => {
        if (
          this.workflowStage !== "SELECT_CLAY_BODY" ||
          !hitResult ||
          !hitResult.position ||
          !this.wheelCenterAnchor
        ) {
          return;
        }
        // Only snap to roughly horizontal table surfaces (normal.y > 0.7)
        if (hitResult.normal && hitResult.normal.y < 0.7) return;
        this.wheelCenterAnchor
          .getTransform()
          .setWorldPosition(hitResult.position);
      });
    } catch (_e) {
      // Ignore transient hit-test errors in preview
    }
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
    // 1. Studio Card UI Buttons (Primary Hand-Building Flow + Secondary Modal Triggers)
    if (this.studioUI) {
      this.studioUI.onStageAction.add(() => {
        this.playUiClick();
        this.handleStageAction();
      });
      this.studioUI.onCycleClayMass.add(() => {
        this.playUiClick();
        this.cycleClayMass();
      });
      this.studioUI.onCycleShrinkage.add(() => {
        this.playUiClick();
        this.cycleClayBody();
      });
      this.studioUI.onCycleHandBuildTech.add(() => {
        this.playUiClick();
        this.cycleHandBuildingTechnique();
      });
      this.studioUI.onCycleMoistureState.add(() => {
        this.playUiClick();
        this.cycleMoistureState();
      });
      this.studioUI.onApplyFreeformSculpt.add(() => {
        this.playUiClick();
        this.applyNextFreeformSculptPreset();
      });
      this.studioUI.onOpenDecoration.add(() => {
        this.playUiClick();
        this.openDecorationModal();
      });
      this.studioUI.onOpenFiring.add(() => {
        this.playUiClick();
        this.openFiringModal();
      });
      this.studioUI.onCyclePreset.add(() => {
        this.playUiClick();
        this.cycleVesselPreset();
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

    // 1b. Secondary Modal Panel (Dekorasi -> Pembakaran -> Hasil Akhir)
    if (this.modalPanel) {
      this.modalPanel.onCycleSurface.add(() => {
        this.playUiClick();
        this.cycleSurfaceTreatment();
      });
      this.modalPanel.onCycleGlazeMethod.add(() => {
        this.playUiClick();
        this.cycleGlazeMethod();
      });
      this.modalPanel.onCycleGlazeCte.add(() => {
        this.playUiClick();
        this.cycleGlazeCteFit();
      });
      this.modalPanel.onToggleCraftPrep.add(() => {
        this.playUiClick();
        this.toggleCraftPrepMode();
      });
      this.modalPanel.onCycleFiringMethod.add(() => {
        this.playUiClick();
        this.cycleFiringMethod();
      });
      this.modalPanel.onCycleCooling.add(() => {
        this.playUiClick();
        this.cycleCoolingRate();
      });
      this.modalPanel.onToggleKilnHost.add(() => {
        this.playUiClick();
        this.toggleElectricKilnHost();
      });
      this.modalPanel.onCycleBisqueVent.add(() => {
        this.playUiClick();
        this.cycleBisqueAndVentilation();
      });
      this.modalPanel.onPrimaryNext.add(() => {
        this.playUiClick();
        this.handleModalPrimaryNext();
      });
      this.modalPanel.onSecondaryBack.add(() => {
        this.playUiClick();
        this.handleModalSecondaryBack();
      });
    }

    // 2. All 5 Radial Zone Sculpting Handles (coupled via ClayWheelPhysicsEngine + 360 orbital right axis!)
    for (let i = 0; i < this.zoneHandles.length; i++) {
      const slot = this.zoneHandles[i];
      slot.interactable.onDragUpdate.add((event: DragInteractorEvent) => {
        const dragVec = event.dragVector;
        if (!dragVec) return;

        this.ensureThrowingStage();

        // Project world drag onto user's screen-right orbital axis so dragging works from ANY 360 angle!
        const dragRight =
          dragVec.x * this.currentOrbitalBasis.rightX +
          dragVec.z * this.currentOrbitalBasis.rightZ;
        const deltaMm = dragRight * 1.8;
        const maxH = this.getCurrentMaxHeightCm();
        this.clayState = ClayWheelPhysicsEngine.applyRadialForce(
          this.wetTarget.wetRadiiMm,
          this.clayState,
          slot.zoneIndex,
          deltaMm,
          maxH
        );

        // Vertical Y drag on Rim (or upward pull on any wall zone) pulls clay taller/shorter!
        if (Math.abs(dragVec.y) > 0.002) {
          const vScale = slot.zoneIndex === 4 ? 0.28 : 0.14;
          this.clayState = ClayWheelPhysicsEngine.applyVerticalForce(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            dragVec.y * vScale,
            maxH
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
          this.ensureThrowingStage();
          this.clayState = ClayWheelPhysicsEngine.applyVerticalForce(
            this.wetTarget.wetRadiiMm,
            this.clayState,
            dragVec.y * 0.3,
            this.getCurrentMaxHeightCm()
          );
          this.updateContactRing(this.getActualHeightCm(), "TOP_OPEN");
          this.recomputeAndRefreshVisuals();
        }
      );
    }

    // 4. Free 3D PotterHandTool — TRUE LOCAL 3D ASYMMETRIC SCULPTING!
    //    Push outward from inside to form a spout/bulge, pinch outside to dent one side,
    //    or pull UP/DOWN near the rim to sculpt wavy/wiggle/asymmetric heights!
    if (this.potterHandToolInteractable) {
      this.potterHandToolInteractable.onDragUpdate.add(
        (event: DragInteractorEvent) => {
          const dragVec = event.dragVector;
          if (!dragVec || !this.potterHandToolObj) return;

          this.ensureThrowingStage();

          const moveScale = 0.7;
          const b = this.currentOrbitalBasis;
          const dragRight = dragVec.x * b.rightX + dragVec.z * b.rightZ;
          const dx = dragRight * moveScale;
          const dy = dragVec.y * moveScale;

          const nextX = Math.max(
            -14.5,
            Math.min(14.5, this.potterToolPlaneX + dx)
          );
          const nextY = Math.max(
            0.6,
            Math.min(26.5, this.potterToolPlaneY + dy)
          );
          this.potterToolPlaneX = nextX;
          this.potterToolPlaneY = nextY;
          this.syncPotterHandToolTransform();

          // Compute exact 3D local position in WheelCenterAnchor space so walking around the pot sculpts ANY angle!
          const lx = b.rightX * nextX;
          const lz = b.rightZ * nextX;
          const rToolCm = Math.sqrt(lx * lx + lz * lz);
          const actualH = Math.max(2.0, this.getActualHeightCm());
          const tContact = Math.max(0, Math.min(1, nextY / actualH));

          if (rToolCm > 0.35 && nextY <= actualH + 5.5) {
            const toolTheta = Math.atan2(lz, lx);
            const baseWallCm = LatheMeshGenerator.interpolateRadiusCm(
              this.getActualRadiiMm(),
              tContact
            );
            const wallRCm =
              baseWallCm +
              this.freeformField.sampleRadialOffsetCm(tContact, toolTheta);

            // Outward radial velocity along tool's local radial vector
            const velX = b.rightX * dx;
            const velZ = b.rightZ * dx;
            const radialVelCm = (lx * velX + lz * velZ) / rToolCm;
            const distToWall = Math.abs(rToolCm - wallRCm);

            if (distToWall <= 3.6) {
              const mode: HandContactMode =
                rToolCm < wallRCm
                  ? "INSIDE_PUSH"
                  : tContact > 0.78 && Math.abs(dy) > Math.abs(dx)
                  ? "TOP_OPEN"
                  : "OUTSIDE_SQUEEZE";

              // Apply localized Gaussian brush (radial push/pinch + rim height lift/dip!)
              const radialDeltaMm = radialVelCm * 14.0;
              const rimHeightDeltaCm = tContact >= 0.45 ? dy * 0.95 : 0;

              this.freeformField.applyLocalBrush(
                toolTheta,
                tContact,
                radialDeltaMm,
                rimHeightDeltaCm,
                0.55,
                0.28
              );

              this.updatePotterHandToolVisual(mode);
              this.updateContactRing(Math.min(actualH, nextY), mode);
              this.recomputeAndRefreshVisuals();
            } else {
              this.updatePotterHandToolVisual("NONE");
            }
          } else {
            this.updatePotterHandToolVisual("NONE");
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
          const rHandCm = Math.sqrt(
            localPos.x * localPos.x + localPos.z * localPos.z
          );
          const actualH = Math.max(2.0, this.getActualHeightCm());
          const tContact = Math.max(0, Math.min(1, localPos.y / actualH));

          if (rHandCm > 0.35 && localPos.y >= 0 && localPos.y <= actualH + 4.5) {
            const handTheta = Math.atan2(localPos.z, localPos.x);
            const wallRCm =
              LatheMeshGenerator.interpolateRadiusCm(
                this.getActualRadiiMm(),
                tContact
              ) + this.freeformField.sampleRadialOffsetCm(tContact, handTheta);
            const distToWall = Math.abs(rHandCm - wallRCm);
            const radialVelCm =
              (localPos.x * vel.x + localPos.z * vel.z) / rHandCm;

            if (distToWall <= 2.6 && (Math.abs(radialVelCm) > 0.03 || Math.abs(vel.y) > 0.03)) {
              this.ensureThrowingStage();
              this.freeformField.applyLocalBrush(
                handTheta,
                tContact,
                radialVelCm * 14.0,
                tContact >= 0.45 ? vel.y * 0.95 : 0,
                0.5,
                0.26
              );
              const mode: HandContactMode =
                rHandCm < wallRCm ? "INSIDE_PUSH" : "OUTSIDE_SQUEEZE";
              this.updateContactRing(Math.min(actualH, localPos.y), mode);
              this.recomputeAndRefreshVisuals();
            }
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
      normalized.includes("lock table") ||
      normalized.includes("start throwing")
    ) {
      this.playUiClick();
      this.handleStageAction();
    } else if (
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
    } else if (
      normalized.includes("reset clay") ||
      normalized.includes("reset globe")
    ) {
      this.playUiClick();
      this.resetClayDeformation();
    } else if (
      normalized.includes("clay weight") ||
      normalized.includes("more clay")
    ) {
      this.playUiClick();
      this.cycleClayMass();
    }
  }

  public handleStageAction(): void {
    if (this.workflowStage === "SELECT_CLAY_BODY") {
      this.stopTableWorldQuery();
      this.workflowStage = "SHAPING_HANDBUILDING";
      this.recomputeAndRefreshVisuals();
    } else if (this.workflowStage === "SHAPING_HANDBUILDING") {
      this.resetClayDeformation();
    } else {
      this.workflowStage = "SHAPING_HANDBUILDING";
      this.resetClayDeformation();
    }
  }

  private ensureThrowingStage(): void {
    if (this.workflowStage !== "SHAPING_HANDBUILDING") {
      this.stopTableWorldQuery();
      this.workflowStage = "SHAPING_HANDBUILDING";
    }
  }

  public cycleClayBody(): void {
    this.selectedClayBody = nextInOrder(CLAY_BODY_ORDER, this.selectedClayBody);
    const spec = CLAY_BODY_CATALOG[this.selectedClayBody];
    this.setShrinkagePreset(spec.legacyClayType);
  }

  public cycleHandBuildingTechnique(): void {
    const nextTech = nextInOrder(
      HAND_BUILDING_ORDER,
      this.handBuildingParams.technique
    );
    const spec = HAND_BUILDING_CATALOG[nextTech];
    this.handBuildingParams = {
      ...this.handBuildingParams,
      technique: nextTech,
      wallThicknessMm:
        (spec.recommendedWallMinMm + spec.recommendedWallMaxMm) / 2,
      baseThicknessMm:
        (spec.recommendedBaseMinMm + spec.recommendedBaseMaxMm) / 2,
      rimThicknessMm: Math.max(4.0, spec.recommendedWallMinMm),
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleMoistureState(): void {
    const nextMoisture = nextInOrder(
      MOISTURE_STATE_ORDER,
      this.handBuildingParams.moistureState
    );
    this.handBuildingParams = {
      ...this.handBuildingParams,
      moistureState: nextMoisture,
    };
    this.recomputeAndRefreshVisuals();
  }

  public applyNextFreeformSculptPreset(): void {
    this.ensureThrowingStage();
    const b = this.currentOrbitalBasis;
    const facingTheta = Math.atan2(b.toCamZ, b.toCamX);
    this.freeformField.applyPreset(this.nextFreeformPreset, facingTheta);
    this.nextFreeformPreset = nextInOrder(
      FREEFORM_PRESET_ORDER,
      this.nextFreeformPreset
    );
    this.recomputeAndRefreshVisuals();
  }

  public openDecorationModal(): void {
    this.stopTableWorldQuery();
    this.workflowStage = "DECORATION_OPTIONS";
    // Auto-advance moisture from plastic -> leather-hard if user didn't switch yet
    if (this.handBuildingParams.moistureState === "plastic") {
      this.handBuildingParams = {
        ...this.handBuildingParams,
        moistureState: "leather-hard",
      };
    }
    this.recomputeAndRefreshVisuals();
  }

  public openFiringModal(): void {
    this.stopTableWorldQuery();
    this.workflowStage = "FIRING_OPTIONS";
    // Default realistic studio prep: advance to bone-dry/bisqueware when entering kiln unless user wants to test wet clay
    if (
      this.handBuildingParams.moistureState === "plastic" ||
      this.handBuildingParams.moistureState === "leather-hard"
    ) {
      this.handBuildingParams = {
        ...this.handBuildingParams,
        moistureState:
          this.surfaceSelection.glazeMethod !== "NONE" &&
          !this.surfaceSelection.rawGlazeAttempted
            ? "bisqueware"
            : "bone-dry",
      };
    }
    this.recomputeAndRefreshVisuals();
  }

  public cycleSurfaceTreatment(): void {
    const nextSurf = nextInOrder(
      SURFACE_TREATMENT_ORDER,
      this.surfaceSelection.surfaceTreatment
    );
    this.surfaceSelection = {
      ...this.surfaceSelection,
      surfaceTreatment: nextSurf,
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleGlazeMethod(): void {
    const nextGlaze = nextInOrder(
      GLAZE_METHOD_ORDER,
      this.surfaceSelection.glazeMethod
    );
    this.surfaceSelection = {
      ...this.surfaceSelection,
      glazeMethod: nextGlaze,
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleGlazeCteFit(): void {
    const cteOrder: readonly GlazeCteFitMode[] = [
      "OPTIMAL",
      "HIGH_CTE_CRAZING",
      "LOW_CTE_SHIVERING",
    ];
    this.surfaceSelection = {
      ...this.surfaceSelection,
      glazeCteFit: nextInOrder(cteOrder, this.surfaceSelection.glazeCteFit),
    };
    this.recomputeAndRefreshVisuals();
  }

  public toggleCraftPrepMode(): void {
    const nextOk = !this.handBuildingParams.scoreAndSlipApplied;
    this.handBuildingParams = {
      ...this.handBuildingParams,
      scoreAndSlipApplied: nextOk,
      compressedOrPaddled: nextOk,
      bidirectionalSlabRolled: nextOk,
      moistureMismatchBetweenLayers: !nextOk,
    };
    this.surfaceSelection = {
      ...this.surfaceSelection,
      slipMatchesBody: nextOk,
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleFiringMethod(): void {
    const nextMethod = nextInOrder(
      FIRING_METHOD_ORDER,
      this.firingParams.method
    );
    this.firingParams = {
      ...this.firingParams,
      method: nextMethod,
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleCoolingRate(): void {
    const rates: readonly ("controlled" | "normal" | "fast")[] = [
      "controlled",
      "normal",
      "fast",
    ];
    this.firingParams = {
      ...this.firingParams,
      coolingRate: nextInOrder(rates, this.firingParams.coolingRate),
    };
    this.recomputeAndRefreshVisuals();
  }

  public toggleElectricKilnHost(): void {
    this.firingParams = {
      ...this.firingParams,
      useElectricKilnHost: !this.firingParams.useElectricKilnHost,
    };
    this.recomputeAndRefreshVisuals();
  }

  public cycleBisqueAndVentilation(): void {
    if (!this.firingParams.lowBisqueCone && this.firingParams.ventilationActive) {
      this.firingParams = {
        ...this.firingParams,
        lowBisqueCone: true,
        ventilationActive: true,
      };
    } else if (this.firingParams.lowBisqueCone && this.firingParams.ventilationActive) {
      this.firingParams = {
        ...this.firingParams,
        lowBisqueCone: false,
        ventilationActive: false,
      };
    } else {
      this.firingParams = {
        ...this.firingParams,
        lowBisqueCone: false,
        ventilationActive: true,
      };
    }
    this.recomputeAndRefreshVisuals();
  }

  public handleModalPrimaryNext(): void {
    if (this.workflowStage === "DECORATION_OPTIONS") {
      this.openFiringModal();
    } else if (this.workflowStage === "FIRING_OPTIONS") {
      this.workflowStage = "FINAL_RESULT";
      this.recomputeAndRefreshVisuals();
    } else if (this.workflowStage === "FINAL_RESULT") {
      this.workflowStage = "FIRING_OPTIONS";
      this.recomputeAndRefreshVisuals();
    }
  }

  public handleModalSecondaryBack(): void {
    if (this.workflowStage === "DECORATION_OPTIONS") {
      this.workflowStage = "SHAPING_HANDBUILDING";
      this.recomputeAndRefreshVisuals();
    } else if (this.workflowStage === "FIRING_OPTIONS") {
      this.workflowStage = "DECORATION_OPTIONS";
      this.recomputeAndRefreshVisuals();
    } else if (this.workflowStage === "FINAL_RESULT") {
      this.workflowStage = "SHAPING_HANDBUILDING";
      this.handBuildingParams = {
        ...this.handBuildingParams,
        moistureState: "plastic",
      };
      this.resetClayDeformation();
    }
  }

  private evaluateMaterialSimulation(): SimulationResult {
    const radiiMm = this.getActualRadiiMm();
    const maxRadiusMm = Math.max(...radiiMm);
    return CeramicCompatibilityEngine.evaluate({
      clayBody: this.selectedClayBody,
      shaping: this.handBuildingParams,
      surface: this.surfaceSelection,
      firing: this.firingParams,
      wetDimensionsCm: {
        heightCm: this.getActualHeightCm(),
        maxDiameterCm: Math.round((maxRadiusMm * 2.0) / 10.0 * 100) / 100,
      },
    });
  }

  private stopTableWorldQuery(): void {
    try {
      if (this.hitTestSession && typeof this.hitTestSession.stop === "function") {
        this.hitTestSession.stop();
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  }

  public cycleClayMass(): void {
    this.selectedClayMass = ClayStudioFlowEngine.nextMassPreset(
      this.selectedClayMass
    );
    // Always immediately drop & resize the 3D Globe Piece on the board!
    this.freeformField.reset();
    this.clayState = ClayStudioFlowEngine.buildGlobePieceState(
      this.wetTarget.wetRadiiMm,
      this.selectedClayMass
    );
    this.tealStableSeconds = 0;
    this.chimePlayedForCurrentHold = false;
    this.potterToolPlaneX = -5.2;
    this.potterToolPlaneY = this.clayState.actualHeightCm + 3.2;
    this.syncPotterHandToolTransform();
    this.recomputeAndRefreshVisuals();
  }

  public cycleShrinkagePreset(): void {
    const nextType = KilnShrinkageEngine.nextClayType(this.currentClayType);
    this.setShrinkagePreset(nextType);
  }

  public setShrinkagePreset(clayType: ClayType): void {
    // Preserve physical wet clay radii & height when changing holographic shrinkage target
    const prevActualRadiiMm = this.getActualRadiiMm();
    const prevActualHeightCm = this.clayState.actualHeightCm;
    this.currentClayType = clayType;
    this.wetTarget = KilnShrinkageEngine.computeWetTarget(
      this.currentVesselSpec,
      this.currentClayType
    );
    const nextOffsets: [number, number, number, number, number] = [
      prevActualRadiiMm[0] - this.wetTarget.wetRadiiMm[0],
      prevActualRadiiMm[1] - this.wetTarget.wetRadiiMm[1],
      prevActualRadiiMm[2] - this.wetTarget.wetRadiiMm[2],
      prevActualRadiiMm[3] - this.wetTarget.wetRadiiMm[3],
      prevActualRadiiMm[4] - this.wetTarget.wetRadiiMm[4],
    ];
    this.clayState = {
      zoneOffsetsMm: nextOffsets,
      actualHeightCm: prevActualHeightCm,
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
    // Drop a fresh raw rounded Globe Piece clay mound on the banding board!
    this.freeformField.reset();
    this.nextFreeformPreset = "WIGGLE_RIM";
    this.clayState = ClayStudioFlowEngine.buildGlobePieceState(
      this.wetTarget.wetRadiiMm,
      this.selectedClayMass
    );
    this.tealStableSeconds = 0;
    this.chimePlayedForCurrentHold = false;
    this.potterToolPlaneX = -5.2;
    this.potterToolPlaneY = this.clayState.actualHeightCm + 3.2;
    this.syncPotterHandToolTransform();
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
    // 0. 360-degree camera-following orbital layout for UI Card, Caliper Gauge, and Handles
    this.updateOrbitalCameraLayout();

    // 0b. Step 1 (SELECT_CLAY_BODY): gently pulse & rotate table reticle + poll SPECS WorldQuery
    if (this.workflowStage === "SELECT_CLAY_BODY") {
      this.tableReticlePulsePhase += dt * 2.4;
      if (this.tableReticleObj) {
        const pulse = 1.0 + 0.035 * Math.sin(this.tableReticlePulsePhase);
        this.tableReticleObj
          .getTransform()
          .setLocalScale(new vec3(pulse, 1.0, pulse));
        this.tableReticleObj
          .getTransform()
          .setLocalRotation(
            quat.fromEulerAngles(0, -this.tableReticlePulsePhase * 0.25, 0)
          );
      }
      this.pollTableWorldQuery(dt);
    }

    // 1. Hand-Building Banding Board: stationary during Pinching/Coiling/Slab/Kurinuki
    //    (slow showcase turntable rotation only in FINAL_RESULT to inspect fired ceramic)
    if (this.workflowStage === "FINAL_RESULT") {
      this.wheelSpinAngleRad =
        (this.wheelSpinAngleRad + dt * 0.45) % (Math.PI * 2);
      const showcaseQuat = quat.fromEulerAngles(0, this.wheelSpinAngleRad, 0);
      if (this.wheelBatObj) {
        this.wheelBatObj.getTransform().setLocalRotation(showcaseQuat);
      }
      if (this.spinningClayObj) {
        this.spinningClayObj.getTransform().setLocalRotation(showcaseQuat);
      }
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

  /**
   * Orbits StudioCardAnchor, CaliperGaugeLine, zone handles, and PotterHandTool around
   * WheelCenterAnchor based on the user's horizontal camera position so every panel and
   * gauge always faces the user cleanly from all 360 degrees around the pottery table.
   */
  private updateOrbitalCameraLayout(): void {
    if (!this.mainCameraObj || !this.wheelCenterAnchor) return;

    const camPos = this.mainCameraObj.getTransform().getWorldPosition();
    const anchorPos = this.wheelCenterAnchor.getTransform().getWorldPosition();

    const basis = ClayStudioFlowEngine.computeOrbitalBasis(
      { x: anchorPos.x, z: anchorPos.z },
      { x: camPos.x, z: camPos.z }
    );
    this.currentOrbitalBasis = basis;

    const facingQuat = quat.fromEulerAngles(0, basis.yawRad, 0);

    const actualRadiiMm = this.getActualRadiiMm();
    const actualHeightCm = this.getActualHeightCm();
    const maxVesselRadiusCm = Math.max(...actualRadiiMm) / 10.0;
    const panelY = anchorPos.y + Math.max(11.5, actualHeightCm * 0.65);

    // 1. StudioCardAnchor orbits cleanly OUTSIDE the clay & zone handles (never blocks vessel!)
    if (this.studioCardAnchor) {
      const cardRight = Math.max(14.2, maxVesselRadiusCm + 6.0);
      const cardBack = 3.5;
      const cardWorldPos = new vec3(
        anchorPos.x + basis.rightX * cardRight - basis.toCamX * cardBack,
        panelY,
        anchorPos.z + basis.rightZ * cardRight - basis.toCamZ * cardBack
      );
      this.studioCardAnchor.getTransform().setWorldPosition(cardWorldPos);
      this.studioCardAnchor
        .getTransform()
        .setWorldRotation(
          quat.fromEulerAngles(0, basis.yawRad - 16 * MathUtils.DegToRad, 0)
        );
    }

    // 1b. CeramicModalAnchor orbits cleanly to user's left side outside the clay
    if (this.modalAnchor) {
      const modalLeft = Math.max(14.0, maxVesselRadiusCm + 5.8);
      const modalBack = 2.5;
      const modalWorldPos = new vec3(
        anchorPos.x - basis.rightX * modalLeft - basis.toCamX * modalBack,
        panelY,
        anchorPos.z - basis.rightZ * modalLeft - basis.toCamZ * modalBack
      );
      this.modalAnchor.getTransform().setWorldPosition(modalWorldPos);
      this.modalAnchor
        .getTransform()
        .setWorldRotation(
          quat.fromEulerAngles(0, basis.yawRad + 16 * MathUtils.DegToRad, 0)
        );
    }

    // 2. CaliperGaugeLine orbits to user's left side outside vessel silhouette
    if (this.caliperGaugeLineObj) {
      const caliperLeft = Math.max(11.0, maxVesselRadiusCm + 2.4);
      this.caliperGaugeLineObj
        .getTransform()
        .setLocalPosition(
          new vec3(-basis.rightX * caliperLeft, 0.0, -basis.rightZ * caliperLeft)
        );
      this.caliperGaugeLineObj.getTransform().setLocalRotation(facingQuat);
    }

    // 3. TableReticleLabel stays centered in front of reticle facing camera
    if (this.tableReticleLabel) {
      const labelObj = this.tableReticleLabel.getSceneObject();
      labelObj
        .getTransform()
        .setLocalPosition(
          new vec3(basis.toCamX * 11.8, 2.0, basis.toCamZ * 11.8)
        );
      labelObj.getTransform().setLocalRotation(facingQuat);
    }

    // 4. All 5 radial zone handles stay along user's right silhouette of the clay
    for (let i = 0; i < this.zoneHandles.length; i++) {
      const slot = this.zoneHandles[i];
      const radialDist = actualRadiiMm[i] / 10.0 + 0.9;
      const frontBias = 1.8;
      slot.sceneObject
        .getTransform()
        .setLocalPosition(
          new vec3(
            basis.rightX * radialDist + basis.toCamX * frontBias,
            actualHeightCm * slot.heightFraction,
            basis.rightZ * radialDist + basis.toCamZ * frontBias
          )
        );
    }

    // 5. PotterHandTool stays in the camera-facing cross-section plane with billboarded label
    this.syncPotterHandToolTransform();
  }

  private syncPotterHandToolTransform(): void {
    if (!this.potterHandToolObj) return;
    const b = this.currentOrbitalBasis;
    this.potterHandToolObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          b.rightX * this.potterToolPlaneX,
          this.potterToolPlaneY,
          b.rightZ * this.potterToolPlaneX
        )
      );
    this.potterHandToolObj
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(0, b.yawRad, 0));
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

    // Evaluate Ceramic Material & Compatibility Engine across all 4 categories
    const materialEval = this.evaluateMaterialSimulation();
    this.lastEvaluation = materialEval;

    // Hide CaliperGaugeLine when left-side Modal Panel is open so they never overlap!
    const isModalOpen =
      this.workflowStage === "DECORATION_OPTIONS" ||
      this.workflowStage === "FIRING_OPTIONS" ||
      this.workflowStage === "FINAL_RESULT";
    if (this.caliperGaugeLineObj) {
      this.caliperGaugeLineObj.enabled = !isModalOpen;
    }

    // Show glowing table reticle & prompt ONLY during Step 1 (SELECT_CLAY_BODY)
    const showReticle = this.workflowStage === "SELECT_CLAY_BODY";
    if (this.tableReticleObj) {
      this.tableReticleObj.enabled = showReticle;
    }
    if (this.tableReticleLabel) {
      this.tableReticleLabel.getSceneObject().enabled = showReticle;
    }

    // Reposition & recolor all 5 radial zone handles along the live clay silhouette (camera-aligned!)
    const actualRadiiMm = this.getActualRadiiMm();
    const b = this.currentOrbitalBasis;
    for (let i = 0; i < this.zoneHandles.length; i++) {
      const slot = this.zoneHandles[i];
      const radialDist = actualRadiiMm[i] / 10.0 + 0.9;
      const frontBias = 1.8;
      slot.sceneObject
        .getTransform()
        .setLocalPosition(
          new vec3(
            b.rightX * radialDist + b.toCamX * frontBias,
            actualHeightCm * slot.heightFraction,
            b.rightZ * radialDist + b.toCamZ * frontBias
          )
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

    // Update UIKit Studio Card HUD with 5-stage Ceramic Materials Workflow
    const claySpec = CLAY_BODY_CATALOG[this.selectedClayBody];
    const techSpec = HAND_BUILDING_CATALOG[this.handBuildingParams.technique];
    const surfSpec =
      SURFACE_TREATMENT_CATALOG[this.surfaceSelection.surfaceTreatment];
    const glazeSpec =
      GLAZE_APPLICATION_CATALOG[this.surfaceSelection.glazeMethod];
    const firingSpec = FIRING_METHOD_CATALOG[this.firingParams.method];

    if (this.studioUI) {
      const massPreset = ClayStudioFlowEngine.getMassPreset(
        this.selectedClayMass
      );
      const massShort =
        massPreset.grams >= 1000
          ? `${(massPreset.grams / 1000).toFixed(1)}kg`
          : `${massPreset.grams}g`;
      const stageTitle =
        this.workflowStage === "SELECT_CLAY_BODY"
          ? "STEP 1/5 · PILIH CLAY BODY"
          : this.workflowStage === "SHAPING_HANDBUILDING"
          ? "STEP 2/5 · HAND-BUILDING"
          : this.workflowStage === "DECORATION_OPTIONS"
          ? "STEP 3/5 · OPSI DEKORASI"
          : this.workflowStage === "FIRING_OPTIONS"
          ? "STEP 4/5 · PEMBAKARAN"
          : "STEP 5/5 · HASIL & EVALUASI";
      const stageActionLabel =
        this.workflowStage === "SELECT_CLAY_BODY"
          ? "Mulai Shaping"
          : "Reset Globe";
      const stageHint =
        this.workflowStage === "SELECT_CLAY_BODY"
          ? `${claySpec.coneRangeLabel}`
          : this.workflowStage === "SHAPING_HANDBUILDING"
          ? `${techSpec.indonesianName} · Wall ${this.handBuildingParams.wallThicknessMm.toFixed(0)}mm`
          : `${materialEval.status}`;

      const badgeLabel =
        this.selectedClayBody === "PAPER_CLAY"
          ? "11% PAPER CLAY"
          : KilnShrinkageEngine.getDisplayLabel(this.currentClayType);

      this.studioUI.updateMetrics(
        badgeLabel,
        bellyStatus,
        combinedMatch,
        `Clay: ${claySpec.name}`,
        stageTitle,
        stageActionLabel,
        `Mass: ${massShort}`,
        stageHint,
        `Tech: ${techSpec.name}`,
        `State: ${this.handBuildingParams.moistureState}`,
        `${techSpec.name} · ${this.handBuildingParams.moistureState}`,
        FreeformClayField.getPresetLabel(this.nextFreeformPreset)
      );
    }

    // Sync Secondary Modal Panel (Dekorasi / Pembakaran / Hasil Akhir)
    if (this.modalPanel) {
      const cteLabel =
        this.surfaceSelection.glazeCteFit === "OPTIMAL"
          ? "CTE: Optimal"
          : this.surfaceSelection.glazeCteFit === "HIGH_CTE_CRAZING"
          ? "CTE: Crazing (-3-4x)"
          : "CTE: Shivering (Fail)";
      const bisqueVentLabel = !this.firingParams.ventilationActive
        ? "Vent: OFF (Risk!)"
        : this.firingParams.lowBisqueCone
        ? "Bisque: Low C06"
        : "Bisque/Vent: Safe";

      this.modalPanel.syncState({
        stage: this.workflowStage,
        surfaceLabel: `Surf: ${surfSpec.name}`,
        glazeMethodLabel: `Glaze: ${glazeSpec.name}`,
        glazeCteLabel: cteLabel,
        craftPrepLabel: this.handBuildingParams.scoreAndSlipApplied
          ? "Prep: Score&Slip ON"
          : "Prep: OFF (Defect!)",
        firingMethodLabel: `Fire: ${firingSpec.name}`,
        coolingLabel: `Cool: ${this.firingParams.coolingRate}`,
        kilnHostLabel: this.firingParams.useElectricKilnHost
          ? "Kiln: Electric Host"
          : "Kiln: Dedicated",
        bisqueVentLabel,
        evaluation: materialEval,
      });
    }

    this.rebuildGhostWireframeMesh(bellyStatus, zoneStatuses);
    this.rebuildCaliperGaugeMesh(actualHeightCm, heightStatus);
    this.rebuildSpinningClayMesh(actualHeightCm, materialEval);
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

  private rebuildSpinningClayMesh(
    actualHeightCm: number,
    materialEval?: SimulationResult
  ): void {
    if (!this.spinningClayObj) return;
    const claySpec = CLAY_BODY_CATALOG[this.selectedClayBody];
    const isFinalFired = this.workflowStage === "FINAL_RESULT" && !!materialEval;
    const clayColor = isFinalFired
      ? materialEval!.firedTintColor
      : claySpec.wetColor;

    // Visually demonstrate physical kiln shrinkage when displaying FINAL_RESULT!
    const scaleFactor = isFinalFired
      ? Math.max(0.75, 1.0 - materialEval!.appliedShrinkagePct / 100.0)
      : 1.0;
    const renderHeightCm = actualHeightCm * scaleFactor;
    const renderRadiiMm = this.getActualRadiiMm().map((r) => r * scaleFactor);

    const geom = LatheMeshGenerator.buildSolidVessel(
      renderHeightCm,
      renderRadiiMm,
      clayColor,
      32,
      20,
      this.handBuildingParams.technique,
      this.surfaceSelection.surfaceTreatment,
      this.handBuildingParams.compressedOrPaddled,
      this.freeformField
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
