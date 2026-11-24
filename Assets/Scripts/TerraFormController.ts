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
} from "./Core/ProfileDeltaEvaluator";
import { SeriesConsistencyTracker } from "./Core/SeriesConsistencyTracker";
import { FovNavigationMath } from "./Core/FovNavigationMath";
import {
  LatheMeshGenerator,
  OPTICAL_PALETTE,
  RgbaColor,
} from "./Core/LatheMeshGenerator";
import { ClayViewStudioUI } from "./ClayViewStudioUI";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";

const THEME_FONT = requireAsset("../Fonts/Inter.ttf") as Font;
const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material;
const ICON_ARROW = requireAsset("../Icons/arrow_forward.png") as Texture;
const STABILITY_CHIME_TRACK = requireAsset(
  "../GeneratedSFX/stability_chime.wav"
) as AudioTrackAsset;
const UI_CLICK_TRACK = requireAsset(
  "../GeneratedSFX/ui_click.wav"
) as AudioTrackAsset;

export const DEFAULT_FIRED_VESSEL: FiredVesselSpec = {
  presetName: "Studio Cylinder Vase",
  firedHeightCm: 16.0,
  zoneFiredRadiiMm: [40.0, 62.0, 75.0, 68.0, 75.0],
};

/**
 * TerraFormController — Thin Lens Studio adapter connecting ClayView's Pure TypeScript Core
 * (`Assets/Scripts/Core/`) to:
 * - Procedural MeshBuilder GhostProfileMesh (16 ribs + 6 rings, MeshTopology.Lines)
 * - Procedural SpinningClayMesh & PotteryWheelBat stand-in (MeshTopology.Triangles)
 * - CaliperGaugeLine vertical height ruler at (-11.0, -26.0, -55.0) cm
 * - SpectaclesUIKit ClayViewStudioUI at (+15.0, -21.0, -58.0) cm (width 9.0 cm)
 * - SIK InteractableManipulation on ClayZoneHandle_Belly
 * - Snap AsrModule hands-free voice commands ("next piece", "toggle wireframe", "set porcelain")
 * - Spatial Audio confirmation chime (2.0s MATCH_TEAL stability hold)
 * - Camera-relative EdgeGuidanceHUD / EdgeOfScreenArrow (> 16.0 deg off-screen)
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

  private currentClayType: ClayType = "STONEWARE_12";
  private wetTarget: WetVesselTarget = KilnShrinkageEngine.computeWetTarget(
    DEFAULT_FIRED_VESSEL,
    "STONEWARE_12"
  );
  private zoneRadiusOffsetsMm: [number, number, number, number, number] = [
    0, 0, 0, 0, 0,
  ];
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
  private bellyHandleObj: SceneObject | null = null;
  private edgeArrowObj: SceneObject | null = null;

  // Text Component reference on CaliperGaugeLine
  private targetHeightText: Text | null = null;

  // Procedural MeshBuilder & Visual references
  private ghostMeshBuilder: MeshBuilder | null = null;
  private ghostMeshVisual: RenderMeshVisual | null = null;
  private caliperMeshBuilder: MeshBuilder | null = null;
  private caliperMeshVisual: RenderMeshVisual | null = null;
  private clayMeshBuilder: MeshBuilder | null = null;
  private clayMeshVisual: RenderMeshVisual | null = null;
  private handleMeshBuilder: MeshBuilder | null = null;

  // Wheel rotation state (60 RPM = 2*PI rad/sec, toned visually to 1.6 rad/s for smooth preview)
  private wheelSpinAngleRad: number = 0;

  // Belly handle manipulation state
  private bellyHandleBaseLocalX: number = 0;

  // Stability chime timer state (2.0s all-zones MATCH_TEAL)
  private tealStableSeconds: number = 0;
  private chimePlayedForCurrentHold: boolean = false;
  private chimeAudioComponent: AudioComponent | null = null;
  private uiClickAudioComponent: AudioComponent | null = null;

  // ASR module handle
  private asrModule: any = null;

  onAwake(): void {
    this.ensureSceneHierarchy();
    this.recomputeAndRefreshVisuals();

    this.createEvent("OnStartEvent").bind(() => {
      this.bindUIAndVoice();
    });

    this.createEvent("UpdateEvent").bind((eventData) => {
      this.onUpdate(eventData.getDeltaTime());
    });

    this.createEvent("OnDestroyEvent").bind(() => {
      this.stopVoiceRecognition();
    });
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

    // 3. SpinningClayMesh (procedural rotating wet clay vessel stand-in)
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

    // 5. CaliperGaugeLine at (-11.0, -26.0, -55.0) cm (local (-11, 0, 0))
    this.caliperGaugeLineObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "CaliperGaugeLine",
      new vec3(-11.0, 0.0, 0.0)
    );

    const targetHeightObj = this.getOrCreateChildObject(
      this.caliperGaugeLineObj,
      "TargetHeightText",
      new vec3(-0.8, 9.5, 0.0)
    );
    this.targetHeightText = this.getOrCreateText(
      targetHeightObj,
      "18.18 cm",
      24,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );

    // 6. ClayZoneHandle_Belly (SIK Interactable + InteractableManipulation handle)
    const initialBellyRadiusCm = this.wetTarget.wetRadiiMm[2] / 10.0;
    this.bellyHandleBaseLocalX = initialBellyRadiusCm;
    this.bellyHandleObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "ClayZoneHandle_Belly",
      new vec3(initialBellyRadiusCm, this.wetTarget.wetHeightCm * 0.5, 0.0)
    );
    this.setupBellyHandle(this.bellyHandleObj);

    // 7. StudioCardAnchor at (+15.0, -21.0, -58.0) cm (calibrated 9.0 cm width)
    this.studioCardAnchor = this.getOrCreateRootObject(
      "StudioCardAnchor",
      new vec3(15.0, -21.0, -58.0)
    );
    // Angle slightly inward toward user eye position for comfortable reading
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

    // 8. EdgeGuidanceHUD parented to MainCamera at (0, 0, -50) cm
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

  private setupBellyHandle(handleObj: SceneObject): void {
    // Visual glowing diamond/octahedron beacon so the user sees the draggable belly handle
    const half = 1.1;
    const c = OPTICAL_PALETTE.CYAN;
    const verts: number[] = [
      // Top pyramid (4 faces, 3 verts each, CCW outward)
      0, half, 0, c.r, c.g, c.b, 0.9,  0, 0, half, c.r, c.g, c.b, 0.9,   half, 0, 0, c.r, c.g, c.b, 0.9,
      0, half, 0, c.r, c.g, c.b, 0.9,  half, 0, 0, c.r, c.g, c.b, 0.9,   0, 0, -half, c.r, c.g, c.b, 0.9,
      0, half, 0, c.r, c.g, c.b, 0.9,  0, 0, -half, c.r, c.g, c.b, 0.9,  -half, 0, 0, c.r, c.g, c.b, 0.9,
      0, half, 0, c.r, c.g, c.b, 0.9,  -half, 0, 0, c.r, c.g, c.b, 0.9,  0, 0, half, c.r, c.g, c.b, 0.9,
      // Bottom pyramid (4 faces, CCW outward)
      0, -half, 0, c.r, c.g, c.b, 0.9, half, 0, 0, c.r, c.g, c.b, 0.9,   0, 0, half, c.r, c.g, c.b, 0.9,
      0, -half, 0, c.r, c.g, c.b, 0.9, 0, 0, -half, c.r, c.g, c.b, 0.9,  half, 0, 0, c.r, c.g, c.b, 0.9,
      0, -half, 0, c.r, c.g, c.b, 0.9, -half, 0, 0, c.r, c.g, c.b, 0.9,  0, 0, -half, c.r, c.g, c.b, 0.9,
      0, -half, 0, c.r, c.g, c.b, 0.9, 0, 0, half, c.r, c.g, c.b, 0.9,   -half, 0, 0, c.r, c.g, c.b, 0.9,
    ];
    const indices: number[] = [];
    for (let i = 0; i < 24; i++) indices.push(i);

    this.handleMeshBuilder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "color", components: 4 },
    ]);
    this.handleMeshBuilder.topology = MeshTopology.Triangles;
    this.handleMeshBuilder.indexType = MeshIndexType.UInt16;
    this.handleMeshBuilder.appendVerticesInterleaved(verts);
    this.handleMeshBuilder.appendIndices(indices);

    const rmv =
      (handleObj.getComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual) ||
      (handleObj.createComponent(
        "Component.RenderMeshVisual"
      ) as RenderMeshVisual);
    rmv.mesh = this.handleMeshBuilder.getMesh();
    if (this.wireframeMaterial) {
      rmv.mainMaterial = this.wireframeMaterial;
    }
    this.handleMeshBuilder.updateMesh();

    // Physics Collider for SIK raycast/direct targeting
    let collider = handleObj.getComponent(
      "Physics.ColliderComponent"
    ) as ColliderComponent | null;
    if (!collider) {
      collider = handleObj.createComponent(
        "Physics.ColliderComponent"
      ) as ColliderComponent;
      const boxShape = Shape.createBoxShape();
      boxShape.size = new vec3(4.0, 4.0, 4.0);
      collider.shape = boxShape;
    }

    // SIK Interactable + InteractableManipulation (translate enabled, rotate/scale off)
    let interactable = handleObj.getComponent(
      Interactable.getTypeName()
    ) as Interactable | null;
    if (!interactable) {
      interactable = handleObj.createComponent(
        Interactable.getTypeName()
      ) as Interactable;
    }

    let manip = handleObj.getComponent(
      InteractableManipulation.getTypeName()
    ) as InteractableManipulation | null;
    if (!manip) {
      manip = handleObj.createComponent(
        InteractableManipulation.getTypeName()
      ) as InteractableManipulation;
    }
    if (manip) {
      manip.setCanTranslate(true);
      manip.setCanRotate(false);
      manip.setCanScale(false);
    }
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
    // Flip arrow_forward to point left toward the wheel
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

  private bindUIAndVoice(): void {
    if (this.studioUI) {
      this.studioUI.onCycleShrinkage.add(() => {
        this.playUiClick();
        this.cycleShrinkagePreset();
      });
      this.studioUI.onSavePiece.add(() => {
        this.playUiClick();
        this.saveCurrentPieceAndAdvance();
      });
      this.studioUI.onToggleWireframe.add(() => {
        this.playUiClick();
        this.toggleWireframeVisibility();
      });
    }

    this.initVoiceRecognition();
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
      if (this.asrModule && typeof this.asrModule.stopTranscribing === "function") {
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
    }
  }

  public cycleShrinkagePreset(): void {
    const nextType = KilnShrinkageEngine.nextClayType(this.currentClayType);
    this.setShrinkagePreset(nextType);
  }

  public setShrinkagePreset(clayType: ClayType): void {
    this.currentClayType = clayType;
    this.wetTarget = KilnShrinkageEngine.computeWetTarget(
      DEFAULT_FIRED_VESSEL,
      this.currentClayType
    );

    if (this.bellyHandleObj) {
      const newBellyRadiusCm = this.wetTarget.wetRadiiMm[2] / 10.0;
      const deltaCm =
        this.bellyHandleObj.getTransform().getLocalPosition().x -
        this.bellyHandleBaseLocalX;
      this.bellyHandleBaseLocalX = newBellyRadiusCm;
      this.bellyHandleObj
        .getTransform()
        .setLocalPosition(
          new vec3(
            newBellyRadiusCm + deltaCm,
            this.wetTarget.wetHeightCm * 0.5,
            0.0
          )
        );
    }

    this.recomputeAndRefreshVisuals();
  }

  public saveCurrentPieceAndAdvance(): void {
    const summary = this.evaluateCurrentProfile();
    this.seriesTracker.recordPiece(
      summary.matchPercentage,
      summary.maxDeviationMm,
      this.currentClayType
    );

    // Reset zone deformation handles for next piece
    this.zoneRadiusOffsetsMm = [0, 0, 0, 0, 0];
    this.tealStableSeconds = 0;
    this.chimePlayedForCurrentHold = false;

    if (this.bellyHandleObj) {
      const baseRadiusCm = this.wetTarget.wetRadiiMm[2] / 10.0;
      this.bellyHandleBaseLocalX = baseRadiusCm;
      this.bellyHandleObj
        .getTransform()
        .setLocalPosition(
          new vec3(baseRadiusCm, this.wetTarget.wetHeightCm * 0.5, 0.0)
        );
    }

    this.recomputeAndRefreshVisuals();
  }

  public toggleWireframeVisibility(): void {
    if (this.ghostProfileMeshObj) {
      this.ghostProfileMeshObj.enabled = !this.ghostProfileMeshObj.enabled;
    }
  }

  private onUpdate(dt: number): void {
    // 1. Spin wheel bat & wet clay mesh continuously
    this.wheelSpinAngleRad = (this.wheelSpinAngleRad + dt * 1.6) % (Math.PI * 2);
    const spinQuat = quat.fromEulerAngles(0, this.wheelSpinAngleRad, 0);
    if (this.wheelBatObj) {
      this.wheelBatObj.getTransform().setLocalRotation(spinQuat);
    }
    if (this.spinningClayObj) {
      this.spinningClayObj.getTransform().setLocalRotation(spinQuat);
    }

    // 2. Track ClayZoneHandle_Belly drag offset in cm -> mm
    if (this.bellyHandleObj) {
      const currentLocalX = this.bellyHandleObj
        .getTransform()
        .getLocalPosition().x;
      const deltaCm = currentLocalX - this.bellyHandleBaseLocalX;
      const deltaMm = Math.round(deltaCm * 10.0 * 100) / 100;
      if (Math.abs(deltaMm - this.zoneRadiusOffsetsMm[2]) > 0.05) {
        this.zoneRadiusOffsetsMm[2] = deltaMm;
        this.recomputeAndRefreshVisuals();
      }
    }

    // 3. Stability chime timer: play once after 2.0s continuous MATCH_TEAL across all 5 zones
    const summary = this.evaluateCurrentProfile();
    if (summary.allZonesStable) {
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

    // 4. Off-Screen Navigation check (DC-5: > 16.0 deg horizontal yaw away from WheelCenterAnchor)
    this.updateOffscreenGuidance();
  }

  private updateOffscreenGuidance(): void {
    if (!this.mainCameraObj || !this.wheelCenterAnchor || !this.edgeArrowObj) {
      return;
    }

    const camTransform = this.mainCameraObj.getTransform();
    const camPos = camTransform.getWorldPosition();
    const camBack = camTransform.back; // In Lens Studio, camera looks down local -Z (transform.back)
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

  private getActualRadiiMm(): number[] {
    return this.wetTarget.wetRadiiMm.map(
      (targetR, idx) => targetR + this.zoneRadiusOffsetsMm[idx]
    );
  }

  private recomputeAndRefreshVisuals(): void {
    const summary = this.evaluateCurrentProfile();
    const bellyStatus = summary.zones[2].status;
    const zoneStatuses = summary.zones.map((z) => z.status);

    // Update CaliperGaugeLine height text
    if (this.targetHeightText) {
      this.targetHeightText.text = KilnShrinkageEngine.formatHeightCm(
        this.wetTarget.wetHeightCm,
        2
      );
    }

    // Update UIKit Studio Card HUD
    if (this.studioUI) {
      this.studioUI.updateMetrics(
        KilnShrinkageEngine.getDisplayLabel(this.currentClayType),
        this.seriesTracker.getCounterLabel(),
        bellyStatus,
        summary.matchPercentage
      );
    }

    this.rebuildGhostWireframeMesh(bellyStatus, zoneStatuses);
    this.rebuildCaliperGaugeMesh();
    this.rebuildSpinningClayMesh();
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

  private rebuildCaliperGaugeMesh(): void {
    if (!this.caliperGaugeLineObj) return;
    const geom = LatheMeshGenerator.buildCaliperGauge(
      this.wetTarget.wetHeightCm,
      OPTICAL_PALETTE.CYAN
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

  private rebuildSpinningClayMesh(): void {
    if (!this.spinningClayObj) return;
    const clayColor =
      this.currentClayType === "PORCELAIN_14"
        ? OPTICAL_PALETTE.CLAY_PORCELAIN
        : OPTICAL_PALETTE.CLAY_STONEWARE;

    const geom = LatheMeshGenerator.buildSolidVessel(
      this.wetTarget.wetHeightCm,
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
