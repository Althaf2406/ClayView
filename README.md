# ClayView (TerraForm AR) — Precision Pottery & Kiln Shrinkage AR Companion

Built for **Snap Spectacles (SPECS)** — *Learn AR with SPECS Round 2* Hackathon on Devpost (`$2,500` Prize Pool).
Planned with the official [`challengepost/learn-specs`](https://github.com/challengepost/learn-specs) skill pack (`plan-lens`) and built for **CLAD** + **Lens Studio MCP**.

---

## 🏺 The One Spatial Moment
Potters working on a wheel have their hands coated in wet clay slip. Touching phones, tablets, or handling metal calipers breaks rhythm and risks damaging electronic hardware. 

**ClayView** projects a 1:1 holographic lathe wireframe (`GhostProfileMesh`) directly over the spinning clay at `(0, -26, -55) cm` (`-25.30°` pitch). It automates real-time **Kiln Shrinkage Compensation** (`0%` to `14%` porcelain shrinkage), tracks 5 height zones with millimeter-accurate color-coded tolerance feedback (`MATCH_TEAL` `≤ 2 mm`, `WARN_AMBER` `2–4 mm`, `OVER_CORAL` / `UNDER_CORAL` `> 4 mm`), emits a 2.0-second stability spatial audio chime, and responds to **hands-free voice commands** (`"next piece"`, `"toggle wireframe"`, `"set porcelain"`) paired 1:1 with SIK spatial buttons for deterministic Preview and LEAF testing.

---

## 📂 Project Structure & Devpost Requirements
- **[`devpost/design-brief.md`](devpost/design-brief.md):** Official `plan-lens` design brief (`status: approved`) following the `challengepost/learn-specs` template.
- **[`.design/brand/CHARTER.md`](.design/brand/CHARTER.md):** Optical LCOS additive waveguide palette (`#000000` = transparent), frustum geometry (`37° × 32°`), and spatial typography charter.
- **[`ClayView.esproj`](ClayView.esproj):** Lens Studio project configured for `targetPlatform: Spectacles`.
- **Layer 1 — Pure TypeScript Domain (`Assets/Scripts/Core/`):**
  - [`KilnShrinkageEngine.ts`](Assets/Scripts/Core/KilnShrinkageEngine.ts) — Kiln firing shrinkage math ($wet = \frac{fired}{1 - rate}$) & clay presets (`0%`, `10%`, `12%`, `14%`).
  - [`ProfileDeltaEvaluator.ts`](Assets/Scripts/Core/ProfileDeltaEvaluator.ts) — 5-zone wall radius tolerance evaluator & aggregate match scoring.
  - [`SeriesConsistencyTracker.ts`](Assets/Scripts/Core/SeriesConsistencyTracker.ts) — 6-piece production series logger & running match average.
  - [`LatheMeshGenerator.ts`](Assets/Scripts/Core/LatheMeshGenerator.ts) — Procedural 16-rib × 6-ring rotational lathe wireframe generator (`MeshTopology.Lines`).
  - [`FovNavigationMath.ts`](Assets/Scripts/Core/FovNavigationMath.ts) — `> 16.0°` off-screen gaze angle evaluator for `EdgeOfScreenArrow`.
- **Layer 2 & 3 — Lens Studio Runtime Adapter & Spatial Audio:**
  - [`TerraFormController.ts`](Assets/Scripts/TerraFormController.ts) — Thin runtime controller wiring `MeshBuilder`, SIK `Interactable` / `InteractableManipulation`, `LensStudio:AsrModule`, and spatial audio.
  - `Assets/GeneratedSFX/` — License-clean synthesized WAV assets (`stability_chime.wav`, `ui_click.wav`) generated via `/build-sfx`.
- **Layer 4 — Automated Tests (Node.js + LEAF Scenarios):**
  - [`clayview_core.test.ts`](Assets/Tests/NodeCoreTests/clayview_core.test.ts) — 10 Pure TypeScript unit tests (`100% pass`).
  - [`LeafIndex.ts`](Assets/Tests/LeafScenarios/LeafIndex.ts) & `Test01`–`Test05` — 5 automated LEAF scenarios covering Done Criteria `DC-1` through `DC-5`.

---

## 🧪 Testing & Verification

### 1. Run Pure TypeScript Core Unit Tests (Node.js)
```bash
npx tsx --test Assets/Tests/NodeCoreTests/clayview_core.test.ts
```
Expected result: `10 pass, 0 fail` (100% green).

### 2. Run in Lens Studio & Execute CLAD / LEAF Scenarios
1. Open **`ClayView.esproj`** in **Lens Studio** (recommended: **Lens Studio 5.23.2** if sign-in is blocked on 5.24, or **5.24+ / 5.25+** with Developer Sign-In active).
2. Ensure the **Preview Panel** is set to **SPECS (Stereo) / Interactive Preview** mode.
3. Attach `Assets/Scripts/TerraFormController.ts` to a root SceneObject (or run the CLAD scene bootstrap once Lens Studio MCP is connected on port `50040`).
4. Install `Leaf.lspkg` from the Lens Studio Asset Library (or via `/specs-leaf-install-packages`), attach `Assets/Tests/LeafScenarios/LeafIndex.ts`, and run the 5 LEAF scenarios (`DC-1` to `DC-5`).

