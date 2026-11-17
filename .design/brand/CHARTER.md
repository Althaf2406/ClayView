# ClayView (TerraForm AR) — Visual Charter & Spatial Design System

**Target Platform:** Snap Spectacles (SPECS) & Lens Studio Desktop Preview  
**Display Technology:** LCOS Additive Waveguide Display (Field of View: 37° horizontal × 32° vertical)  
**Primary Interaction:** Hands-free Voice Commands (`AsrModule`) + SIK Pinch for Calibration

---

## 1. Additive Waveguide Display Optical Rules

Snap Spectacles utilize an optical see-through waveguide engine:
- **Black (`#000000`) is 100% transparent:** The engine cannot render black light. It renders only additive light.
- **Zero Dark Card Backgrounds or Drop Shadows:** Never render solid dark rectangular bounding boxes or drop shadows.
- **High-Contrast Fine Lines:** Gauge lines, wireframes, and rings use 2–3 mm line thickness so the physical clay remains clearly visible beneath the AR hologram.

---

## 2. Color Palette & Optical Calibration

| Visual Role / Status | Hex Code | RGB Normalized | Alpha (α) | Trigger / Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Main Wireframe (`GhostProfileMesh`)** | `#FFFDF5` (Ivory) | `(1.00, 0.99, 0.96)` | `0.65` | 1:1 vertical lathe profile wireframe (16 ribs + 6 rings). High contrast over dark stoneware. |
| **Caliper & Zone Rings (`CaliperGaugeLine`)** | `#4AF2FF` (Cyan) | `(0.29, 0.95, 1.00)` | `0.65` | 5 height zone markers & vertical caliper ruler. Main accent for white porcelain mode. |
| **Fit Tolerance (`MATCH_TEAL`)** | `#2EE59D` (Teal) | `(0.18, 0.90, 0.62)` | `0.65` | Radius deviation $\le 2\text{ mm}$. Triggers spatial chime when all 5 zones stay Teal for 2.0s. |
| **Warning Tolerance (`WARN_AMBER`)** | `#FFC857` (Amber) | `(1.00, 0.78, 0.34)` | `0.65` | Radius deviation $> 2\text{ mm}$ and $\le 4\text{ mm}$. |
| **Critical Deviation (`OVER_CORAL` / `UNDER_CORAL`)** | `#FF6B6B` (Coral) | `(1.00, 0.42, 0.42)` | `0.65` | Radius deviation $> 4\text{ mm}$. Accompanied by text status tag to prevent red-washout on clay. |

---

## 3. Spatial Coordinate Matrix & Calibrated Frustum

| Spatial Anchor | 3D Coordinate $(x, y, z)$ cm | Pitch Angle | Calibrated Bounding Dimensions | Frustum Mitigation & Safe Margin |
| :--- | :--- | :--- | :--- | :--- |
| **`WheelCenterAnchor`** | `(0.0, -26.0, -55.0)` | `-25.30°` | Slant distance 60.84 cm | Center of physical wheel bat. Fits 18.60 cm max wet height with 14.3 cm horizontal and 8.6 cm vertical FOV margin. |
| **`CaliperGaugeLine`** | `(-11.0, -26.0, -55.0)` | `-25.30°` | Height 18.60 cm | Locked to left silhouette edge for hands-free height and diameter inspection. |
| **`StudioCardAnchor`** | `(+15.0, -21.0, -58.0)` | `-19.89°` | Width 9.0 cm (edge +10.5 to +19.5 cm) | Calibrated to stay strictly within $\pm 20.55\text{ cm}$ horizontal FOV boundary at $z = -58.0\text{ cm}$. |
| **`EdgeGuidanceHUD`** | `(0.0, 0.0, -50.0)` | Camera-relative | Size $4.0 \times 4.0\text{ cm}$ | Activates directional cyan arrow when gaze $> 16.0^\circ$ away from wheel anchor. |

---

## 4. Spatial Typography & HUD Hierarchy

- **Font Family:** Inter (SemiBold / Medium), high legibility on transparent waveguide.
- **Numbers / Metrics:** Primary size 24pt, borderless, Ivory (`#FFFDF5`).
- **Zone Labels:** Secondary size 14pt, Cyan (`#4AF2FF`).
- **Maximum Line Width:** $\le 9.0\text{ cm}$ on Studio Card to guarantee zero edge-clipping.
