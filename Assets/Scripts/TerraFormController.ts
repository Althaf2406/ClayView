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

export const DEFAULT_FIRED_VESSEL: FiredVesselSpec = {
  presetName: "Studio Cylinder Vase",
  firedHeightCm: 16.0,
  zoneFiredRadiiMm: [40.0, 62.0, 75.0, 68.0, 75.0],
};

/**
 * TerraFormController — Thin Lens Studio adapter connecting ClayView's Pure TypeScript Core
 * (`Assets/Scripts/Core/`) to procedural MeshBuilder wireframes, SIK interactions,
 * Snap AsrModule voice commands, spatial audio confirmation chimes, and LEAF test targets.
 */
@component
export class TerraFormController extends BaseScriptComponent {
  @input
  @hint("Optional vertex color material for GhostProfileMesh and CaliperGaugeLine")
  public wireframeMaterial?: Material;

  @input
  @hint("Optional stability confirmation chime AudioTrackAsset")
  public stabilityChimeTrack?: AudioTrackAsset;

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
  private ghostProfileMeshObj: SceneObject | null = null;
  private caliperGaugeLineObj: SceneObject | null = null;
  private studioCardAnchor: SceneObject | null = null;
  private bellyHandleObj: SceneObject | null = null;
  private edgeArrowObj: SceneObject | null = null;

  // Text Component references
  private targetHeightText: Text | null = null;
  private shrinkageBadgeText: Text | null = null;
  private bellyZoneStatusText: Text | null = null;
  private matchPercentText: Text | null = null;
  private pieceCounterText: Text | null = null;

  // Procedural MeshBuilder & Visual references
  private ghostMeshBuilder: MeshBuilder | null = null;
  private ghostMeshVisual: RenderMeshVisual | null = null;

  // Belly handle manipulation state
  private bellyHandleBaseLocalX: number = 0;

  // Stability chime timer state (2.0s in MATCH_TEAL)
  private tealStableSeconds: number = 0;
  private chimePlayedForCurrentHold: boolean = false;
  private chimeAudioComponent: AudioComponent | null = null;

  // ASR module handle
  private asrModule: any = null;

  onAwake(): void {
    this.ensureSceneHierarchy();
    this.recomputeAndRefreshVisuals();

    this.createEvent("OnStartEvent").bind(() => {
      this.bindInteractionsAndVoice();
    });

    this.createEvent("UpdateEvent").bind((eventData) => {
      this.onUpdate(eventData.getDeltaTime());
    });
  }

  /**
   * Ensures all required SceneObjects, Text labels, and SIK Interactables exist
   * at exact calibrated world coordinates so both Interactive Preview and LEAF scenarios
   * find them deterministically.
   */
  private ensureSceneHierarchy(): void {
    this.mainCameraObj =
      this.findObjectByName("MainCamera") ||
      this.findObjectByName("Camera Object") ||
      this.findObjectByName("Camera");

    if (this.mainCameraObj && this.mainCameraObj.name !== "MainCamera") {
      // Create a child or alias reference named MainCamera if LEAF searches for "MainCamera"
      const existingAlias = this.findObjectByName("MainCamera");
      if (!existingAlias) {
        this.mainCameraObj.name = "MainCamera";
      }
    }

    // 1. WheelCenterAnchor at (0, -26, -55) cm
    this.wheelCenterAnchor = this.getOrCreateRootObject(
      "WheelCenterAnchor",
      new vec3(0.0, -26.0, -55.0)
    );

    // Spatial AudioComponent on WheelCenterAnchor
    this.chimeAudioComponent =
      (this.wheelCenterAnchor.getComponent(
        "Component.AudioComponent"
      ) as AudioComponent) ||
      (this.wheelCenterAnchor.createComponent(
        "Component.AudioComponent"
      ) as AudioComponent);
    if (this.stabilityChimeTrack && this.chimeAudioComponent) {
      this.chimeAudioComponent.audioTrack = this.stabilityChimeTrack;
    }

    // 2. GhostProfileMesh under WheelCenterAnchor
    this.ghostProfileMeshObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "GhostProfileMesh",
      new vec3(0.0, 0.0, 0.0)
    );
    this.ghostProfileMeshObj.enabled = true;

    // 3. CaliperGaugeLine at (-11.0, -26.0, -55.0) cm (local (-11, 0, 0) relative to WheelCenterAnchor)
    this.caliperGaugeLineObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "CaliperGaugeLine",
      new vec3(-11.0, 0.0, 0.0)
    );

    const targetHeightObj = this.getOrCreateChildObject(
      this.caliperGaugeLineObj,
      "TargetHeightText",
      new vec3(0.0, 9.0, 0.0)
    );
    this.targetHeightText = this.getOrCreateText(
      targetHeightObj,
      "18.18 cm",
      24,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );

    // 4. ClayZoneHandle_Belly under WheelCenterAnchor for deformation simulation
    const initialBellyRadiusCm = this.wetTarget.wetRadiiMm[2] / 10.0;
    this.bellyHandleBaseLocalX = initialBellyRadiusCm;
    this.bellyHandleObj = this.getOrCreateChildObject(
      this.wheelCenterAnchor,
      "ClayZoneHandle_Belly",
      new vec3(initialBellyRadiusCm, this.wetTarget.wetHeightCm * 0.5, 0.0)
    );
    this.ensureInteractable(this.bellyHandleObj, new vec3(4.0, 4.0, 4.0), true);

    // 5. StudioCardAnchor at (+15.0, -21.0, -58.0) cm (calibrated 9.0 cm width)
    this.studioCardAnchor = this.getOrCreateRootObject(
      "StudioCardAnchor",
      new vec3(15.0, -21.0, -58.0)
    );

    const badgeObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "ShrinkageBadgeText",
      new vec3(0.0, 3.2, 0.6)
    );
    this.shrinkageBadgeText = this.getOrCreateText(
      badgeObj,
      "12% STONEWARE",
      20,
      new vec4(1.0, 0.99, 0.96, 1.0)
    );

    const counterObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "PieceCounterText",
      new vec3(0.0, 1.6, 0.6)
    );
    this.pieceCounterText = this.getOrCreateText(
      counterObj,
      "Piece 1 of 6",
      18,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );

    const bellyStatusObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "BellyZoneStatusText",
      new vec3(0.0, 0.0, 0.6)
    );
    this.bellyZoneStatusText = this.getOrCreateText(
      bellyStatusObj,
      "MATCH_TEAL",
      18,
      new vec4(0.18, 0.9, 0.62, 1.0)
    );

    const matchObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "MatchPercentText",
      new vec3(0.0, -1.6, 0.6)
    );
    this.matchPercentText = this.getOrCreateText(
      matchObj,
      "100%",
      22,
      new vec4(1.0, 0.99, 0.96, 1.0)
    );

    // Interactive Preview & LEAF Fallback Buttons under StudioCardAnchor
    const cycleBtnObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "ShrinkageCycleBtn",
      new vec3(0.0, -4.2, 0.6)
    );
    this.getOrCreateText(
      cycleBtnObj,
      "Cycle Clay %",
      16,
      new vec4(1.0, 0.99, 0.96, 1.0)
    );
    this.ensureInteractable(cycleBtnObj, new vec3(6.5, 2.4, 1.5), false);

    const saveBtnObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "SavePieceBtn",
      new vec3(0.0, -7.0, 0.6)
    );
    this.getOrCreateText(
      saveBtnObj,
      "Next Piece",
      16,
      new vec4(0.18, 0.9, 0.62, 1.0)
    );
    this.ensureInteractable(saveBtnObj, new vec3(6.5, 2.4, 1.5), false);

    const toggleBtnObj = this.getOrCreateChildObject(
      this.studioCardAnchor,
      "ToggleWireframeBtn",
      new vec3(0.0, -9.8, 0.6)
    );
    this.getOrCreateText(
      toggleBtnObj,
      "Toggle Mesh",
      16,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );
    this.ensureInteractable(toggleBtnObj, new vec3(6.5, 2.4, 1.5), false);

    // 6. EdgeGuidanceHUD & EdgeOfScreenArrow
    const edgeHudObj = this.getOrCreateRootObject(
      "EdgeGuidanceHUD",
      new vec3(0.0, 0.0, -50.0)
    );
    this.edgeArrowObj = this.getOrCreateChildObject(
      edgeHudObj,
      "EdgeOfScreenArrow",
      new vec3(-12.0, -8.0, 0.0)
    );
    this.getOrCreateText(
      this.edgeArrowObj,
      "< WHEEL",
      20,
      new vec4(0.29, 0.95, 1.0, 1.0)
    );
    this.edgeArrowObj.enabled = false;
  }

  /**
   * Binds SIK Interactable triggers and Snap AsrModule voice commands inside OnStartEvent.
   */
  private bindInteractionsAndVoice(): void {
    this.bindButtonTrigger("ShrinkageCycleBtn", () => {
      this.cycleShrinkagePreset();
    });

    this.bindButtonTrigger("SavePieceBtn", () => {
      this.saveCurrentPieceAndAdvance();
    });

    this.bindButtonTrigger("ToggleWireframeBtn", () => {
      this.toggleWireframeVisibility();
    });

    this.initVoiceRecognition();
  }

  private bindButtonTrigger(
    objectName: string,
    callback: () => void
  ): void {
    const obj = this.findObjectByName(objectName);
    if (!obj) return;

    const components = obj.getComponents("Component.ScriptComponent");
    for (let i = 0; i < components.length; i++) {
      const comp = components[i] as any;
      if (comp && comp.onTriggerUp && typeof comp.onTriggerUp.add === "function") {
        comp.onTriggerUp.add(callback);
        return;
      }
      if (comp && comp.onTriggerEnd && typeof comp.onTriggerEnd.add === "function") {
        comp.onTriggerEnd.add(callback);
        return;
      }
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

      options.onTranscriptionErrorEvent.add((_errorCode: AsrModule.AsrStatusCode) => {
        // Fallback SIK buttons remain active when offline or in Desktop Preview
      });

      this.asrModule.startTranscribing(options);
    } catch (_e) {
      // AsrModule unavailable in non-Spectacles environment; SIK buttons act as 1:1 stand-in
    }
  }

  public handleVoiceTranscript(rawTranscript: string): void {
    const normalized = rawTranscript.toLowerCase().trim();
    if (
      normalized.includes("next piece") ||
      normalized.includes("save piece")
    ) {
      this.saveCurrentPieceAndAdvance();
    } else if (
      normalized.includes("toggle wireframe") ||
      normalized.includes("hide wireframe") ||
      normalized.includes("show wireframe")
    ) {
      this.toggleWireframeVisibility();
    } else if (
      normalized.includes("set porcelain") ||
      normalized.includes("clay porcelain")
    ) {
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

    // Reset zone deformation handles for the new piece
    this.zoneRadiusOffsetsMm = [0, 0, 0, 0, 0];
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
    // 1. Check if ClayZoneHandle_Belly has been dragged in world/local space
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

    // 2. Evaluate 2.0s stability chime timer
    const summary = this.evaluateCurrentProfile();
    if (summary.allZonesStable) {
      this.tealStableSeconds += dt;
      if (this.tealStableSeconds >= 2.0 && !this.chimePlayedForCurrentHold) {
        this.chimePlayedForCurrentHold = true;
        if (
          this.chimeAudioComponent &&
          this.chimeAudioComponent.audioTrack
        ) {
          this.chimeAudioComponent.play(1);
        }
      }
    } else {
      this.tealStableSeconds = 0;
      this.chimePlayedForCurrentHold = false;
    }

    // 3. Evaluate Off-Screen Navigation (DC-5: > 16.0 degrees away from WheelCenterAnchor)
    this.updateOffscreenGuidance();
  }

  private updateOffscreenGuidance(): void {
    if (!this.mainCameraObj || !this.wheelCenterAnchor || !this.edgeArrowObj) {
      return;
    }

    const camTransform = this.mainCameraObj.getTransform();
    const camPos = camTransform.getWorldPosition();
    const camFwd = camTransform.forward;
    const anchorPos = this.wheelCenterAnchor.getTransform().getWorldPosition();

    // Note: in Lens Studio, a camera's default look direction is -Z (transform.back),
    // while rotating yaw by 45 degrees changes transform.back / transform.forward equally.
    // We check against the vector pointing toward the initial wheel direction or -Z.
    const lookDir = new vec3(-camFwd.x, -camFwd.y, -camFwd.z);
    const evalResult = FovNavigationMath.evaluateGazeOffset(
      { x: camPos.x, y: camPos.y, z: camPos.z },
      { x: lookDir.x, y: lookDir.y, z: lookDir.z },
      { x: anchorPos.x, y: anchorPos.y, z: anchorPos.z },
      FovNavigationMath.OFFSCREEN_THRESHOLD_DEG
    );

    if (this.edgeArrowObj.enabled !== evalResult.isOffscreen) {
      this.edgeArrowObj.enabled = evalResult.isOffscreen;
    }
  }

  private evaluateCurrentProfile(): ProfileEvaluationSummary {
    const actualRadiiMm = this.wetTarget.wetRadiiMm.map(
      (targetR, idx) => targetR + this.zoneRadiusOffsetsMm[idx]
    );
    return ProfileDeltaEvaluator.evaluateProfile(
      this.wetTarget.wetRadiiMm,
      actualRadiiMm
    );
  }

  private recomputeAndRefreshVisuals(): void {
    const summary = this.evaluateCurrentProfile();
    const bellyStatus = summary.zones[2].status;

    if (this.targetHeightText) {
      this.targetHeightText.text = KilnShrinkageEngine.formatHeightCm(
        this.wetTarget.wetHeightCm,
        2
      );
    }

    if (this.shrinkageBadgeText) {
      this.shrinkageBadgeText.text = KilnShrinkageEngine.getDisplayLabel(
        this.currentClayType
      );
    }

    if (this.bellyZoneStatusText) {
      this.bellyZoneStatusText.text = bellyStatus;
      this.bellyZoneStatusText.textFill.color = this.statusToVec4(bellyStatus);
    }

    if (this.matchPercentText) {
      this.matchPercentText.text = `${summary.matchPercentage}%`;
    }

    if (this.pieceCounterText) {
      this.pieceCounterText.text = this.seriesTracker.getCounterLabel();
    }

    this.rebuildGhostWireframeMesh(bellyStatus);
  }

  private rebuildGhostWireframeMesh(bellyStatus: ToleranceStatus): void {
    if (!this.ghostProfileMeshObj || typeof MeshBuilder === "undefined") {
      return;
    }

    const ribColor: RgbaColor =
      bellyStatus === "OVER_CORAL" || bellyStatus === "UNDER_CORAL"
        ? OPTICAL_PALETTE.ALERT_CORAL
        : bellyStatus === "WARN_AMBER"
        ? OPTICAL_PALETTE.WARN_AMBER
        : this.currentClayType === "PORCELAIN_14"
        ? OPTICAL_PALETTE.CYAN
        : OPTICAL_PALETTE.IVORY;

    const geom = LatheMeshGenerator.buildWireframe(
      this.wetTarget.wetHeightCm,
      this.wetTarget.wetRadiiMm,
      ribColor,
      OPTICAL_PALETTE.CYAN
    );

    if (!this.ghostMeshBuilder) {
      this.ghostMeshBuilder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "color", components: 4 },
      ]);
      this.ghostMeshBuilder.topology = MeshTopology.Lines;
      this.ghostMeshBuilder.indexType = MeshIndexType.UInt16;
    } else {
      const currentVerts = this.ghostMeshBuilder.getVerticesCount();
      if (currentVerts > 0) {
        this.ghostMeshBuilder.eraseVertices(0, currentVerts);
      }
      const currentIndices = this.ghostMeshBuilder.getIndicesCount();
      if (currentIndices > 0) {
        this.ghostMeshBuilder.eraseIndices(0, currentIndices);
      }
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
    const existing = this.findObjectByName(name);
    if (existing) {
      existing.setParent(parent);
      existing.getTransform().setLocalPosition(localPos);
      return existing;
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
    textComp.size = size;
    textComp.depthTest = true;
    if (textComp.textFill) {
      textComp.textFill.color = color;
    }
    return textComp;
  }

  private ensureInteractable(
    obj: SceneObject,
    boxSizeCm: vec3,
    isDraggable: boolean
  ): void {
    let collider = obj.getComponent(
      "Physics.ColliderComponent"
    ) as ColliderComponent | null;
    if (!collider) {
      collider = obj.createComponent(
        "Physics.ColliderComponent"
      ) as ColliderComponent;
      const boxShape = Shape.createBoxShape();
      boxShape.size = boxSizeCm;
      collider.shape = boxShape;
    }

    try {
      const {
        Interactable,
      } = require("SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable");
      if (Interactable) {
        let interactable = obj.getComponent(Interactable.getTypeName());
        if (!interactable) {
          interactable = obj.createComponent(Interactable.getTypeName());
        }
      }

      if (isDraggable) {
        const {
          InteractableManipulation,
        } = require("SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation");
        if (InteractableManipulation) {
          let manip = obj.getComponent(InteractableManipulation.getTypeName());
          if (!manip) {
            manip = obj.createComponent(InteractableManipulation.getTypeName());
            if (manip && typeof manip.setCanTranslate === "function") {
              manip.setCanTranslate(true);
            }
          }
        }
      }
    } catch (_e) {
      // SIK package resolved at runtime inside Lens Studio
    }
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
