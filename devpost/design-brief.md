---
project: ClayView
status: approved
lens_studio_version: "5.23.2"
packages:
  - SpectaclesInteractionKit: "2.0.0"
  - SpectaclesUIKit: "2.0.0"
  - Leaf: "2.0.2"
target_device: "Snap Spectacles (Gen 4 / 2024)"
track: "Learn AR with SPECS Round 2"
---

# ClayView (TerraForm AR) — Precision Pottery & Kiln Shrinkage AR Companion

## 1. Project Overview & The One Spatial Moment
**ClayView** is a hands-free AR companion for ceramicists, studio sculptors, and craft design students.
- **The One Spatial Moment:** A potter's hands are coated in wet clay slip while leaning over a spinning wheel (`WheelCenterAnchor` at `(0, -26, -55) cm`, pitch `-25.30°`). Touching glass smartphone screens or manual calipers is messy, slow, and error-prone.
- **Kiln Shrinkage Compensation:** Ceramic vessels shrink 10% to 14% during kiln firing. ClayView computes and projects the required wet forming dimensions in real-time ($wet = \frac{fired}{1 - rate}$), guiding the potter to shape the wet clay 1:1 against holographic wireframe target profiles.
- **Hands-Free Control:** Driven by Snap Speech Recognition (`AsrModule`) with SIK spatial pinch buttons as deterministic preview fallbacks.

---

## 2. Core Architecture & Layers

```
Layer 1: Pure TypeScript Domain (Node.js & Lens Studio CommonJS)
  ├── KilnShrinkageEngine.ts (0%, 10%, 12%, 14% presets & shrinkage math)
  ├── ProfileDeltaEvaluator.ts (5 Height Zones: Base, LowerBelly, Belly, Shoulder, Rim)
  └── SeriesConsistencyTracker.ts (Series history, piece counter, avg match %)
        │
Layer 2: Lens Studio Procedural Scene & Adapters
  ├── GhostProfileMesh (Procedural lathe wireframe: 16 ribs + 6 rings via MeshBuilder)
  ├── CaliperGaugeLine (Vertical height and diameter gauge line at x = -11.0 cm)
  ├── StudioCardAnchor (Width 9.0 cm HUD at x = +15.0 cm, y = -21.0 cm, z = -58.0 cm)
  └── ClayZoneHandle_Belly (SIK Interactable + Manipulation for deformation simulation)
        │
Layer 3: Hands-Free Voice & Spatial Audio
  ├── Snap AsrModule ("next piece", "toggle wireframe", "set porcelain")
  └── Spatial Audio Chime (Teal 2.0s stability chime from WheelCenterAnchor)
        │
Layer 4: Automated LEAF Scenarios (100% Green Verification)
  ├── Test01_InitProjectScenario (DC-1)
  ├── Test02_ShrinkageCycleScenario (DC-2)
  ├── Test03_ShapeDeformationScenario (DC-3)
  ├── Test04_SeriesManagementScenario (DC-4)
  └── Test05_OffscreenNavigationScenario (DC-5)
```

---

## 3. Quantitative Done Criteria (DC-1 through DC-5)

- **DC-1 (Scene Anchoring & Scale Precision):** `WheelCenterAnchor` instantiated at `(0.0, -26.0, -55.0) cm`. Procedural `GhostProfileMesh` renders 16 vertical ribs and 6 horizontal contour rings. `StudioCardAnchor` calibrated to width $9.0\text{ cm}$ at `(+15.0, -21.0, -58.0) cm`.
- **DC-2 (Kiln Shrinkage Recalibration):** Cycling clay preset from `STONEWARE_12` (12%) to `PORCELAIN_14` (14%) updates target wet height from $18.18\text{ cm}$ to $18.60\text{ cm}$ ($\pm 0.05\text{ cm}$) and scales `GhostProfileMesh` accordingly.
- **DC-3 (Deformation & Multi-Zone Tolerance Feedback):** Manipulating `ClayZoneHandle_Belly` past the $4.0\text{ mm}$ tolerance threshold transitions zone status to `OVER_CORAL` / `UNDER_CORAL`, updates the aggregate match percentage, and cancels the stability chime timer.
- **DC-4 (Series Consistency & History Logging):** Triggering `"next piece"` logs a `PieceRecord` to `SeriesConsistencyTracker`, updates the HUD label from `Piece 1 of 6` to `Piece 2 of 6`, resets deformation handles, and recomputes the running average match percentage.
- **DC-5 (Offscreen Gaze Navigation):** Rotating camera gaze $> 16.0^\circ$ away from `WheelCenterAnchor` activates the borderless cyan arrow in `EdgeGuidanceHUD`; rotating back within $16.0^\circ$ automatically hides it.
