# ClayView (TerraForm AR) — Precision Pottery & Kiln Shrinkage AR Companion

Built for **Snap Spectacles** — *Learn AR with SPECS Round 2* Hackathon on Devpost ($2,500 Prize Pool).

---

## 🏺 The One Spatial Moment
Potters working on a wheel have their hands coated in wet clay slip. Touching phones, tablets, or handling metal calipers breaks rhythm and risks damaging electronic hardware. 

**ClayView** projects a 1:1 holographic lathe wireframe (`GhostProfileMesh`) directly over the spinning clay at `(0, -26, -55) cm`. It automates real-time **Kiln Shrinkage Compensation** (0% to 14% porcelain shrinkage), tracks height zones with sub-centimeter color-coded tolerance feedback (Teal, Amber, Coral), and responds to **hands-free voice commands** (`"next piece"`, `"toggle wireframe"`, `"set porcelain"`).

---

## 🛠️ Architecture & Tech Stack
- **Engine:** Lens Studio 5.23.2
- **Frameworks:**
  - Spectacles Interaction Kit (SIK) v2.0.0
  - Spectacles UI Kit v2.0.0
  - Leaf Testing Framework v2.0.2 (`Leaf.lspkg`)
- **Domain Logic:** Pure TypeScript (`Assets/Scripts/Core/`) decoupled from Lens Studio engine globals for 100% fast Node.js unit testing.
- **Display System:** LCOS Additive Waveguide Optics (Black = 100% transparent; Ivory, Cyan, Teal, Amber, Coral palette).

---

## 🧪 Testing & Verification
Run the Pure TypeScript unit test suite:
```bash
npx tsx --test Assets/Tests/NodeCoreTests/clayview_core.test.ts
```
Expected result: `8 pass, 0 fail` (100% green).
