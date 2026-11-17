---
status: approved
project: ClayView
lens_studio_version: "5.23.2 / 5.24.1"
packages:
  - SpectaclesInteractionKit: "2.0.0"
  - SpectaclesUIKit: "2.0.0"
  - Leaf: "2.0.2"
target_device: "Snap Spectacles (SPECS)"
track: "Learn AR with SPECS Round 2"
---

# Design brief: ClayView (TerraForm AR)

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
When your clay-covered hands are shaping a spinning vessel on the pottery wheel, a 1:1 holographic ivory-cyan lathe wireframe (`GhostProfileMesh`) wraps around the clay at `(0, -26, -55) cm` and flashes a coral tolerance band (`OVER_CORAL`) the instant the belly or rim widens more than `4 mm` beyond your kiln-shrinkage-adjusted target — letting you correct the wet clay wall immediately without taking your hands off the wheel.

## Why it belongs on glasses
- Uses: shares your view, draws in the world, leaves your body free
- Why it's better than the phone or laptop version: Throwing clay on a wheel at 60–120 RPM requires both wet, slip-coated hands continuously supporting the vessel wall. Touching a phone or tablet screen with wet silica mud ruins electronics and breaks centering rhythm, while stopping to wash and dry hands causes the clay to lose moisture. Furthermore, 2D reference sketches and metal calipers force the potter to mentally calculate 10%–14% kiln firing shrinkage (`wetDim = firedDim / (1 - shrinkRate)`). Glasses project the exact shrinkage-compensated 3D silhouette at 1:1 millimeter scale directly from the potter's downward gaze (`-25.30°` pitch) with hands-free voice control.

## Product or overlay
- Type: overlay: it responds to the spinning clay vessel on the physical pottery wheel
- What the real version would sense: World surface lock on the wheel head (`WorldQueryModule` / `Spatial Anchors`), real-time silhouette edge extraction from `specs-camera` against the wheel bat, and voice commands via `LensStudio:AsrModule`
- Stand-in for the preview: A procedural spinning clay mesh and 1:1 holographic target wireframe (`MeshBuilder` with `MeshTopology.Lines`) anchored at `WheelCenterAnchor` (`(0, -26, -55) cm`), paired with draggable SIK deformation handles (`ClayZoneHandle_Belly`, etc.) to simulate finger pressure pushing the clay wall against the 2 mm / 4 mm tolerance bands, plus spatial UI buttons (`ShrinkageCycleBtn`, `SavePieceBtn`, `ToggleWireframeBtn`) paired 1:1 with every voice command (`"set porcelain"`, `"next piece"`, `"toggle wireframe"`). Displays an honest notice on the studio card: `"Preview Stand-In: Procedural Spinning Clay & Drag Deformation"`.

## Where things live
- Where the user is looking during the main task: Looking forward and pitched downward `-25.30°` at the center of the pottery wheel head (`(0, -26, -55) cm`, slant distance `60.84 cm`, where the `37° × 32°` FOV spans `40.71 × 34.89 cm` with a comfortable `31.7 × 27.2 cm` inner safe zone).
- `WheelCenterAnchor` & `GhostProfileMesh`: Centered at `(0.0, -26.0, -55.0) cm`, world-anchored over the wheel head; renders a 16-rib, 6-ring rotational lathe wireframe up to `17.44 cm` diameter × `18.60 cm` height (for a `15.0 × 16.0 cm` fired vessel at 14% porcelain shrinkage).
- `CaliperGaugeLine`: Sits at `(-11.0, -26.0, -55.0) cm` (`2.28–3.50 cm` left of the vessel silhouette), height `18.60 cm`, displaying live target wet height (`TargetHeightText`, e.g., `"18.18 cm"` at 12% stoneware or `"18.60 cm"` at 14% porcelain).
- `StudioCardAnchor`: Sits to the right of the wheel at `(+15.0, -21.0, -58.0) cm` (`-19.89°` pitch), calibrated width `9.0 cm` × height `8.5 cm` (right edge at `+19.5 cm`, safely inside the `±20.55 cm` horizontal FOV boundary). Displays clay shrinkage preset (`ShrinkageBadgeText`), piece counter (`PieceCounterText`), zone tolerance status (`BellyZoneStatusText`), and match score (`MatchPercentText`).
- `EdgeGuidanceHUD` (`EdgeOfScreenArrow`): Camera-relative indicator at `(0.0, 0.0, -50.0) cm`, size `4.0 × 4.0 cm`, pointing back toward `WheelCenterAnchor` when the user looks away (`> 16.0°`).

## Hands and input
- `ShrinkageCycleBtn`: SIK/UIKit pinch button on the Studio Card to cycle clay shrinkage presets (`STONEWARE_0` 0% → `LOW_FIRE_10` 10% → `STONEWARE_12` 12% → `PORCELAIN_14` 14%).
- `SavePieceBtn`: SIK/UIKit pinch button on the Studio Card to log the current vessel's match score to the 6-piece series tracker and advance to the next piece.
- `ToggleWireframeBtn`: SIK/UIKit pinch button on the Studio Card to toggle `GhostProfileMesh` visibility (`enabled`).
- `ClayZoneHandle_Belly`: SIK `Interactable` + `InteractableManipulation` handle at the vessel belly zone (`(0, -26, -55) cm` local belly radius) that can be dragged outward/inward in Interactive Preview and LEAF tests to simulate wall deformation against the target profile.
- Targets are big and highlight when aimed at.
- Voice (if any) and the button that does the same job:
  - `"next piece"` / `"save piece"` (`LensStudio:AsrModule`) → `SavePieceBtn`
  - `"toggle wireframe"` / `"hide wireframe"` / `"show wireframe"` (`LensStudio:AsrModule`) → `ToggleWireframeBtn`
  - `"set porcelain"` / `"clay porcelain"` (`LensStudio:AsrModule`) → `ShrinkageCycleBtn`

## When things show
- `GhostProfileMesh` & `CaliperGaugeLine`: Show at start over `WheelCenterAnchor`; can be toggled on/off via `"toggle wireframe"` or `ToggleWireframeBtn` so the potter can inspect raw wet clay surface sheen unobstructed.
- Zone Tolerance Highlights (`MATCH_TEAL` `#2EE59D` for `≤ 2 mm`, `WARN_AMBER` `#FFC857` for `2–4 mm`, `OVER_CORAL` / `UNDER_CORAL` `#FF6B6B` for `> 4 mm`): Show dynamically on the active profile ribs/rings and `BellyZoneStatusText` whenever wall radius deviates.
- If something needs attention out of view: Both a borderless cyan directional arrow (`EdgeOfScreenArrow` when gaze rotates `> 16.0°` away from `WheelCenterAnchor`) and a soft spatial audio confirmation chime (`AudioComponent` on `WheelCenterAnchor`) when all 5 height zones remain stable in `MATCH_TEAL` for `2.0 seconds`.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **DC-1 (Scene Anchoring & Scale Precision):** When the Lens starts in `STONEWARE_12` (12% shrinkage) mode for a `16.0 cm` fired vessel, `WheelCenterAnchor` is positioned at `(0.0, -26.0, -55.0) cm` (`z` between `-60` and `-50`, `y ≈ -26.0`), `GhostProfileMesh` is enabled (`true`) rendering the procedural lathe wireframe, and `TargetHeightText` reads `"18.18 cm"`.
2. **DC-2 (Kiln Shrinkage Recalibration):** Triggering `ShrinkageCycleBtn` transitions the preset from `STONEWARE_12` (12%) to `PORCELAIN_14` (14%), updating `TargetHeightText` to `"18.60 cm"`, `ShrinkageBadgeText` to `"14% PORCELAIN"`, and rescaling `GhostProfileMesh` dimensions accordingly.
3. **DC-3 (Deformation & Multi-Zone Tolerance Feedback):** Dragging `ClayZoneHandle_Belly` outward by `0.6 cm` (`6 mm`, exceeding the `4.0 mm` coral threshold) updates `BellyZoneStatusText` to `"OVER_CORAL"`, lowers `MatchPercentText` below `100%`, and cancels the stability chime timer.
4. **DC-4 (Series Consistency & History Logging):** Triggering `SavePieceBtn` (the preview button paired with voice command `"next piece"`) records the current piece in `SeriesConsistencyTracker` and updates `PieceCounterText` from `"Piece 1 of 6"` to `"Piece 2 of 6"`.
5. **DC-5 (Offscreen Gaze Navigation):** Rotating `MainCamera` (or `Camera Object`) `45°` away from `WheelCenterAnchor` (exceeding the `16.0°` frustum threshold) sets `EdgeOfScreenArrow.enabled` to `true`, and rotating back to center hides it (`false`).

## Out of scope
- Live computer-vision edge segmentation (`SnapML`) on physical spinning clay in the desktop preview (replaced by the procedural mesh and SIK drag handle stand-in).
- Multi-user shared studio sessions (`Connected Lenses`) or persistent cross-session cloud storage.
- Recording, identifying, or tracking any person in the studio.

## Risks and open questions
- **Additive Waveguide Contrast on White Porcelain (feel unproven in preview):** On real SPECS LCOS waveguides (`#000000` = transparent), Ivory (`#FFFDF5`) wireframe lines have lower contrast (`2.78:1` theoretical) over bright white wet porcelain slip; mitigated by pairing with Cyan (`#4AF2FF`) gauge rings and α = `0.65` line opacity.
- **ASR Studio Noise & Offline Preview:** `AsrModule` requires internet connectivity and Spectacles hardware; mitigated by 1:1 SIK button fallbacks (`SavePieceBtn`, `ShrinkageCycleBtn`, `ToggleWireframeBtn`) for deterministic preview and LEAF testing.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

