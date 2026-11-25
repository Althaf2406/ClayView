import {
  CLAY_BODY_CATALOG,
  FIRING_METHOD_CATALOG,
  GLAZE_APPLICATION_CATALOG,
  HAND_BUILDING_CATALOG,
  SURFACE_TREATMENT_CATALOG,
} from "./CeramicMaterialCatalog";
import {
  DefectIssue,
  GlazeFitEvaluation,
  HandBuildingProcessParams,
  SimulationInput,
  SimulationResult,
  SimulationStatus,
  ThermalMilestoneReport,
} from "./CeramicMaterialTypes";
import { OPTICAL_PALETTE, RgbaColor } from "./LatheMeshGenerator";

/**
 * Pure TypeScript Ceramic Material Science & Cross-Stage Compatibility Engine.
 * Evaluates (ClayBody, HandBuildingMethod, SurfaceTreatment & GlazeFit, FiringMethod)
 * against the technical rules of the Ceramic Materials Encyclopedia.
 */
export class CeramicCompatibilityEngine {
  /**
   * Resolves the effective peak firing temperature (C) based on firing method,
   * clay body target cone, Orton heatwork heating rate, and optional explicit override.
   */
  public static resolvePeakTempC(input: SimulationInput): number {
    if (input.firing.targetPeakTempOverrideC !== undefined) {
      return input.firing.targetPeakTempOverrideC;
    }
    const claySpec = CLAY_BODY_CATALOG[input.clayBody];
    const firingSpec = FIRING_METHOD_CATALOG[input.firing.method];

    let basePeak = firingSpec.representativePeakTempC;
    if (input.firing.method === "ELECTRIC_OXIDATION") {
      if (input.clayBody === "EARTHENWARE") {
        // Cone 05-04 standard electric low-fire (~1020 C)
        basePeak = 1020;
      } else {
        // Optimal studio electric Cone 6 sweet spot (1222 C)
        basePeak = 1222;
      }
    }

    // Orton heatwork rate shift (150 C/hr fast ramp requires ~+35 C higher peak for same cone)
    if (input.firing.heatingRate === "fast") {
      basePeak += 35;
    } else if (input.firing.heatingRate === "slow") {
      basePeak -= 15;
    }

    // Keep within sensible physical bounds for decorative firings unless overridden
    if (firingSpec.category === "LOW_FIRE_DECORATIVE") {
      return Math.min(firingSpec.tempMaxC + 40, basePeak);
    }
    return Math.max(claySpec.tempMinC - 200, basePeak);
  }

  /**
   * Returns recommended slab thickness range (mm) based on vessel scale category.
   */
  public static getRecommendedSlabRangeMm(
    scale: HandBuildingProcessParams["vesselScale"]
  ): { min: number; max: number; label: string } {
    switch (scale) {
      case "small":
        return { min: 4, max: 5, label: "4-5 mm (small cup/box)" };
      case "bowl":
        return { min: 5, max: 6, label: "5-6 mm (bowl)" };
      case "large":
        return { min: 6, max: 8, label: "6-8 mm (large vessel)" };
    }
  }

  /**
   * Full cross-stage material compatibility, glaze-fit (CTE), thermal milestone,
   * food-safety, and final fired shrinkage evaluation.
   */
  public static evaluate(input: SimulationInput): SimulationResult {
    const claySpec = CLAY_BODY_CATALOG[input.clayBody];
    const shapingSpec = HAND_BUILDING_CATALOG[input.shaping.technique];
    const surfaceSpec = SURFACE_TREATMENT_CATALOG[input.surface.surfaceTreatment];
    const glazeSpec = GLAZE_APPLICATION_CATALOG[input.surface.glazeMethod];
    const firingSpec = FIRING_METHOD_CATALOG[input.firing.method];

    const peakTempC = this.resolvePeakTempC(input);
    const issues: DefectIssue[] = [];
    const safetyWarnings: string[] = [];

    // ------------------------------------------------------------------
    // 1. CLAY BODY BASELINE & PAPER CLAY SPECIFICS
    // ------------------------------------------------------------------
    if (claySpec.fragileAtBisque) {
      issues.push({
        code: "PAPER_CLAY_BISQUE_FRAGILE",
        severity: "INFO",
        stage: "CLAY_BODY",
        title: "Paper Clay Fragile at Bisqueware Stage",
        explanation:
          "After cellulose fibers burn out in bisque firing before vitrification, Paper Clay reaches its most fragile state (~2x bone-dry strength drops at bisque).",
        remedy:
          "Handle bisqueware gently or leverage Paper Clay's raw-glazing (single firing) capability.",
      });
    }

    if (claySpec.requiresBurnoutVentilation) {
      safetyWarnings.push(
        "Paper Clay Burnout: Mandatory downdraft kiln ventilation required for organic cellulose smoke."
      );
      if (!input.firing.ventilationActive) {
        issues.push({
          code: "PAPER_CLAY_NO_VENTILATION",
          severity: "CRITICAL",
          stage: "SAFETY",
          title: "Missing Ventilation for Paper Clay Burnout",
          explanation:
            "Burning cellulose fibers releases dense organic smoke and CO/VOC fumes inside the kiln room.",
          remedy:
            "Activate mechanical kiln vent or fire outdoors before starting burnout.",
        });
      }
    }

    // ------------------------------------------------------------------
    // 2. HAND-BUILDING SHAPING VALIDATION (CATEGORY 1 - MAIN FOCUS)
    // ------------------------------------------------------------------
    const sh = input.shaping;

    if (sh.technique === "PINCHING") {
      if (sh.rimThicknessMm < 3.0) {
        issues.push({
          code: "PINCHING_RIM_CRACKING",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Rim Cracking Risk (Pinching)",
          explanation: `Rim thickness (${sh.rimThicknessMm.toFixed(1)} mm) is too thin; hand heat dries thin rims faster than the body, causing radial rim cracks.`,
          remedy:
            "Compress the rim regularly with a damp chamois/sponge and keep rim >= 3.5-4.0 mm.",
        });
      }
      if (sh.baseThicknessMm - sh.wallThicknessMm > 6.0) {
        issues.push({
          code: "PINCHING_DRYING_CRACKS",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Drying Crack Risk (Thick Base vs Wall)",
          explanation: `Base (${sh.baseThicknessMm.toFixed(1)} mm) is much thicker than upper wall (${sh.wallThicknessMm.toFixed(1)} mm), creating uneven drying shrinkage tension.`,
          remedy:
            "Trim and compress the base at leather-hard using a rib/paddle to equalize thickness.",
        });
      }
      if (input.surface.coarseGrogBody) {
        issues.push({
          code: "PINCHING_COARSE_GROG_TEAR",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Rim Tearing on Coarse Grog / Short Clay",
          explanation:
            "Coarse grog or low-plasticity short clay tears easily along stretched pinch rims.",
          remedy: "Switch to fine-grog stoneware/earthenware and compress edges gently.",
        });
      }
    }

    if (sh.technique === "COILING") {
      if (!sh.scoreAndSlipApplied) {
        issues.push({
          code: "COILING_NO_SCORE_SLIP",
          severity: "CRITICAL",
          stage: "SHAPING",
          title: "Horizontal Seam Delamination (Missing Score & Slip)",
          explanation:
            "Coils stacked without scoring and slip fail to mechanically lock, splitting horizontally during drying or firing.",
          remedy:
            "Score every coil seam with a serrated rib, apply matching slip, and smear inside/outside in opposite directions.",
        });
      }
      if (!sh.compressedOrPaddled) {
        issues.push({
          code: "COILING_UNCOMPRESSED_SEAM",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Seam Cracking Risk (Uncompressed Coils)",
          explanation:
            "Trapped air pockets in unpaddled coil seams expand and open into horizontal cracks.",
          remedy:
            "Use paddle-and-anvil compression or firm rib blending to eliminate air pockets.",
        });
      }
      if (sh.moistureMismatchBetweenLayers) {
        if (claySpec.supportsWetToDryJoining) {
          issues.push({
            code: "COILING_PAPER_CLAY_WET_TO_DRY_OK",
            severity: "INFO",
            stage: "SHAPING",
            title: "Wet-to-Dry Coil Joining Supported (Paper Clay)",
            explanation:
              "Cellulose capillary action and fiber bridging equalize moisture across coil layers.",
            remedy: "Apply paper clay slip generously at each seam.",
          });
        } else {
          issues.push({
            code: "COILING_MOISTURE_MISMATCH",
            severity: "CRITICAL",
            stage: "SHAPING",
            title: "Seam Cracking (Moisture Mismatch Between Coils)",
            explanation:
              "Joining wet plastic coils onto an already-shrinking drier lower wall causes horizontal seam separation.",
            remedy:
              "Wrap piece in plastic between sessions to equalize moisture, or use Paper Clay for wet-to-dry joins.",
          });
        }
      }
      if (input.clayBody === "PORCELAIN") {
        issues.push({
          code: "COILING_PORCELAIN_WARNING",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Poor Coiling Compatibility with Pure Porcelain",
          explanation:
            "Pure Porcelain has low plasticity and high shrinkage (13%-14.75%), making coil seams highly prone to cracking on larger forms.",
          remedy:
            "Switch to fine-grog Stoneware, Earthenware, or Paper Clay (porcelain + cellulose fiber).",
        });
      }
    }

    if (sh.technique === "SLAB_BUILDING") {
      const slabGuide = this.getRecommendedSlabRangeMm(sh.vesselScale);
      if (sh.wallThicknessMm < 4.0) {
        issues.push({
          code: "SLAB_TOO_THIN",
          severity: "CRITICAL",
          stage: "SHAPING",
          title: "Slab Below 4 mm Structural Minimum",
          explanation: `Slab thickness (${sh.wallThicknessMm.toFixed(1)} mm) lacks structural stiffness and easily bends or snaps when lifted.`,
          remedy: `Roll slab to ${slabGuide.label}.`,
        });
      } else if (
        sh.wallThicknessMm < slabGuide.min ||
        sh.wallThicknessMm > slabGuide.max
      ) {
        issues.push({
          code: "SLAB_THICKNESS_OFF_GUIDE",
          severity: "WARNING",
          stage: "SHAPING",
          title: `Slab Thickness Outside Target (${slabGuide.label})`,
          explanation: `Current slab (${sh.wallThicknessMm.toFixed(1)} mm) is outside workshop guidance (${slabGuide.label}).`,
          remedy: "Use wooden guide sticks or a calibrated slab roller with calipers.",
        });
      }

      if (!sh.bidirectionalSlabRolled) {
        issues.push({
          code: "SLAB_CLAY_MEMORY_WARPING",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Warping Risk (Single-Direction Slab Rolling)",
          explanation:
            "Rolling in only one direction stretches clay platelets unevenly, activating clay memory warping during drying and firing.",
          remedy:
            "Roll in two perpendicular directions, flip mid-roll, compress both faces with a rib, and dry flat between 1.25 cm Sande plywood boards.",
        });
      }

      if (claySpec.shrinkageMaxPct > 12.5 && !claySpec.supportsWetToDryJoining) {
        issues.push({
          code: "SLAB_HIGH_SHRINKAGE_WARPING",
          severity: input.clayBody === "PORCELAIN" ? "WARNING" : "INFO",
          stage: "SHAPING",
          title: "High Shrinkage Warping Risk (>12.5%-13%)",
          explanation: `${claySpec.name} shrinks up to ${claySpec.shrinkageMaxPct}%, increasing slab distortion and slumping without kiln setters.`,
          remedy:
            "Use low-shrinkage Stoneware/Earthenware (<=12%) or Paper Clay to suppress warping on flat slabs.",
        });
      }

      if (!sh.scoreAndSlipApplied) {
        issues.push({
          code: "SLAB_CORNER_CRACKING",
          severity: "CRITICAL",
          stage: "SHAPING",
          title: "Corner Cracking (Unreinforced Slab Joint)",
          explanation:
            "Assembling leather-hard slab corners without score, slip, and an internal reinforcing coil causes corner splits during shrinkage.",
          remedy:
            "Bevel 45-degree edges, score & slip thoroughly, and press a thin reinforcing coil inside each corner.",
        });
      }
    }

    if (sh.technique === "KURINUKI") {
      if (sh.baseThicknessMm - sh.wallThicknessMm > 10.0 || sh.wallThicknessMm > 22.0) {
        issues.push({
          code: "KURINUKI_BOTTOM_CRACKING",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Bottom Cracking Risk (Extreme Base-Wall Gradient)",
          explanation: `Outer walls (${sh.wallThicknessMm.toFixed(1)} mm) dry and shrink faster around a heavy wet base (${sh.baseThicknessMm.toFixed(1)} mm), exceeding green strength.`,
          remedy:
            "Carve interior cleanly to ~15 mm wall and 10-20 mm base, compress the floor, and dry slowly wrapped in plastic over absorbent paper.",
        });
      }
      if (sh.dryingRate === "fast") {
        issues.push({
          code: "KURINUKI_FAST_DRY_STEAM_RISK",
          severity: "CRITICAL",
          stage: "SHAPING",
          title: "Kurinuki Crack & Steam Explosion Risk (Fast Drying)",
          explanation:
            "Thick carved Kurinuki blocks trap core moisture when dried rapidly, causing severe bottom cracks or steam blowouts in the kiln.",
          remedy:
            "Dry very slowly under plastic wrap and schedule an extended 0-150 C kiln candling hold.",
        });
      }
      if (input.clayBody === "PORCELAIN") {
        issues.push({
          code: "KURINUKI_PORCELAIN_RISK",
          severity: "WARNING",
          stage: "SHAPING",
          title: "Thick-Walled Porcelain Kurinuki Crack/Dunting Risk",
          explanation:
            "Pure Porcelain's dense vitreous matrix and high shrinkage (13%-14.75%) make thick Kurinuki blocks prone to drying cracks and cristobalite dunting.",
          remedy:
            "Use fine-to-coarse grogged Stoneware (Cone 5-10) for open steam escape paths and wabi-sabi texture.",
        });
      }
    }

    // ------------------------------------------------------------------
    // 3. SURFACE TREATMENT & DECORATION VALIDATION (CATEGORY 2)
    // ------------------------------------------------------------------
    const surf = input.surface;

    if (surf.surfaceTreatment === "SGRAFFITO") {
      if (!surf.slipMatchesBody || surf.appliedAtMoisture === "bone-dry") {
        issues.push({
          code: "SGRAFFITO_FLAKING",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Sgraffito Slip Flaking / Peeling",
          explanation:
            "Applying slip with mismatched shrinkage or onto bone-dry clay causes the decorative slip layer to flake off.",
          remedy:
            "Formulate colored slip from the exact same base clay body and apply at soft leather-hard.",
        });
      }
      if (surf.coarseGrogBody) {
        issues.push({
          code: "SGRAFFITO_COARSE_GROG",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Jagged Sgraffito Lines on Coarse Grog",
          explanation:
            "Coarse grog particles drag under carving tools, ruining crisp sgraffito graphic edges.",
          remedy: "Use smooth fine-grained Porcelain, Stoneware, or Earthenware.",
        });
      }
    }

    if (surf.surfaceTreatment === "MISHIMA") {
      if (surf.appliedAtMoisture === "plastic") {
        issues.push({
          code: "MISHIMA_SMEARING",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Mishima Color Smearing",
          explanation:
            "Scraping inlay slip while clay or slip is still wet smears dark pigment across the surface.",
          remedy:
            "Wait until inlay slip dries matte at leather-hard before scraping flush (optionally seal surface with wax resist first).",
        });
      }
      if (surf.appliedAtMoisture === "bone-dry") {
        safetyWarnings.push(
          "Mishima Dry Scraping: Risk of crystalline silica & heavy-metal oxide dust (Co/Mn)—use wet cleaning & ventilation."
        );
      }
    }

    if (surf.surfaceTreatment === "SLIP_TRAILING") {
      if (surf.appliedAtMoisture === "bone-dry" || !surf.slipMatchesBody) {
        issues.push({
          code: "SLIP_TRAILING_FLAKING",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Slip Trailing Cracking & Flaking",
          explanation:
            "Raised slip applied onto bone-dry clay or with mismatched shrinkage lifts and flakes off the wall.",
          remedy:
            "Apply lightly deflocculated matching-body slip (80-mesh screened) at leather-hard.",
        });
      }
    }

    if (surf.surfaceTreatment === "NERIKOMI") {
      issues.push({
        code: "NERIKOMI_HIGH_ATTRITION",
        severity: "WARNING",
        stage: "DECORATION",
        title: "Nerikomi Internal Join Cracking & Dunting Risk",
        explanation:
          "Hundreds of internal colored-clay seams create high stress; Mason stains/oxides alter plasticity and flux rates even within one base clay.",
        remedy:
          "Use strictly ONE base clay body, equalize moisture wrapped in plastic for 2-14 days, and run controlled cooling in the kiln.",
      });
      if (input.firing.coolingRate !== "controlled") {
        issues.push({
          code: "NERIKOMI_COOLING_DUNTING",
          severity: "WARNING",
          stage: "FIRING",
          title: "Nerikomi Requires Controlled Kiln Cooling",
          explanation:
            "Rapid electric kiln cooling triggers sharp post-firing dunting along colored clay seam boundaries.",
          remedy: "Program a slow controlled cooling ramp past 573 C and 226 C.",
        });
      }
    }

    if (surf.surfaceTreatment === "BURNISHING") {
      if (peakTempC > 1000) {
        issues.push({
          code: "BURNISHING_DESTROYED_OVER_1000C",
          severity: "CRITICAL",
          stage: "DECORATION",
          title: "Burnishing Sheen Permanently Destroyed (>1000 C / Cone 06+)",
          explanation: `Peak firing temperature (${peakTempC} C) exceeds 1000 C; sintering and glass formation disrupt aligned surface platelets, turning burnish dull/rough.`,
          remedy:
            "Fire burnished ware below 1000 C (optimal Cone 018-015: 715-850 C via Pit, Saggar, Horsehair Raku, or Obvara).",
        });
      }
      if (surf.glazeMethod !== "NONE") {
        issues.push({
          code: "BURNISHING_GLAZE_INCOMPATIBLE",
          severity: "CRITICAL",
          stage: "DECORATION",
          title: "Burnishing Incompatible with Glazing",
          explanation:
            "Glaze melting temperatures destroy mechanical burnishing luster, and burnished surfaces resist liquid glaze adhesion.",
          remedy:
            "Choose either unglazed low-fire Burnishing (decorative, finished with paste wax) OR functional Glazing.",
        });
      }
      if (input.clayBody === "PAPER_CLAY") {
        issues.push({
          code: "BURNISHING_PAPER_CLAY_FIBERS",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Paper Clay Fibers Hinder Smooth Burnishing",
          explanation:
            "Cellulose fibers >=1% drag on polishing stones and reduce specular surface gloss.",
          remedy:
            "Apply 3-5 coats of fine decanted terra sigillata before buffing with chamois.",
        });
      }
    }

    if (surf.surfaceTreatment === "FACETING") {
      if (surf.appliedAtMoisture === "plastic") {
        issues.push({
          code: "FACETING_TOO_WET",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Faceted Planes Slumping (Too Plastic)",
          explanation:
            "Cutting facets while clay is still plastic causes crisp geometric planes to sag into dull curves.",
          remedy: "Wait until soft leather-hard before slicing facets with a wire or knife.",
        });
      } else if (surf.appliedAtMoisture === "bone-dry") {
        issues.push({
          code: "FACETING_TOO_DRY",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Torn Facet Edges (Too Dry)",
          explanation:
            "Slicing stiff/bone-dry clay tears jagged edges and releases crystalline silica dust.",
          remedy: "Perform faceting at soft leather-hard on intentionally thicker walls.",
        });
      }
    }

    // ------------------------------------------------------------------
    // 4. GLAZE APPLICATION & GLAZE FIT ENGINE (CTE)
    // ------------------------------------------------------------------
    let glazeFitStatus: GlazeFitEvaluation = "NONE";

    if (glazeSpec.requiresSprayBoothRespirator) {
      safetyWarnings.push(
        "HVLP Glaze Spraying: Mandatory outdoor/filtered spray booth & certified particulate respirator (respirable silica & heavy-metal mist)."
      );
    }

    if (surf.glazeMethod !== "NONE") {
      if (surf.rawGlazeAttempted) {
        if (claySpec.supportsRawGlazing) {
          issues.push({
            code: "RAW_GLAZING_PAPER_CLAY_OK",
            severity: "INFO",
            stage: "DECORATION",
            title: "Raw Glazing Supported on Paper Clay",
            explanation:
              "Paper Clay's 2x dry strength and fiber capillary network prevent slaking when glazing bone-dry greenware directly.",
            remedy: "Ensure slow 0-150 C candling and active burnout ventilation.",
          });
        } else {
          issues.push({
            code: "RAW_GLAZING_CONVENTIONAL_RISK",
            severity: "CRITICAL",
            stage: "DECORATION",
            title: "Raw Glazing Failure Risk on Unbisqued Clay",
            explanation: `${claySpec.name} bone-dry greenware rapidly absorbs glaze water, causing slaking, swelling, and wall collapse.`,
            remedy:
              "Bisque fire to Cone 06-04 (or Cone 02 for coarse stoneware) first, or switch to Paper Clay.",
          });
        }
      }

      if (surf.glazeCteFit === "OPTIMAL") {
        glazeFitStatus = "Optimal";
      } else if (surf.glazeCteFit === "HIGH_CTE_CRAZING") {
        glazeFitStatus = "Crazing";
        issues.push({
          code: "GLAZE_FIT_CRAZING",
          severity: "WARNING",
          stage: "GLAZE_FIT",
          title: "Glaze Crazing (Glaze CTE > Body CTE)",
          explanation:
            "Glaze shrinks more than the clay body during cooling, creating tension crack networks that reduce mechanical strength by 3-4x (300%-400%) and risk leaching/bacteria on porous bodies.",
          remedy:
            "Replace high-CTE Na2O (0.39) / K2O (0.33) fluxes with low-CTE MgO (0.03), B2O3 (0.03), or SiO2 (0.04).",
        });
      } else if (surf.glazeCteFit === "LOW_CTE_SHIVERING") {
        glazeFitStatus = "Shivering";
        issues.push({
          code: "GLAZE_FIT_SHIVERING",
          severity: "CRITICAL",
          stage: "GLAZE_FIT",
          title: "Glaze Shivering (Glaze CTE << Body CTE)",
          explanation:
            "Excessive compression pops razor-sharp glass splinters off rims/curves and can trigger spontaneous spiral cracking.",
          remedy:
            "Increase glaze CTE by substituting part of MgO/CaO/Li2O with high-Na2O frit (e.g. Ferro 3110) or lower free quartz in body.",
        });
      }
    } else if (input.firing.method === "SALT_SODA") {
      glazeFitStatus = "Crazing";
      issues.push({
        code: "SALT_SODA_NATURAL_CRAZING",
        severity: "INFO",
        stage: "GLAZE_FIT",
        title: "Natural Na2O Vapor Crazing (Salt / Soda)",
        explanation:
          "Sodium-silicate vapor glaze (Na2O CTE 0.39) commonly exhibits fine crazing, which is practically accepted over fully vitrified stoneware/porcelain.",
        remedy: "Apply a well-fitted interior liner glaze (e.g. Shino) for tableware.",
      });
    }

    // ------------------------------------------------------------------
    // 5. FIRING COMPATIBILITY & ATMOSPHERE VALIDATION (CATEGORY 3)
    // ------------------------------------------------------------------
    if (firingSpec.requiresOutdoorOrAcidRespirator) {
      safetyWarnings.push(`${firingSpec.name}: ${firingSpec.safetyNotes}`);
    }

    // RULE: Electric Kiln + Salt / Soda / Saggar -> BLOCKED (Destroys Kanthal elements)
    if (input.firing.useElectricKilnHost && firingSpec.bannedInElectricKiln) {
      issues.push({
        code: "ELECTRIC_KILN_CORROSIVE_VAPOR_BAN",
        severity: "BLOCKED",
        stage: "FIRING",
        title: `Blocked: ${firingSpec.name} Banned in Electric Kiln`,
        explanation:
          "Halide/chlorine (HCl/Cl2), ferric chloride, and sodium vapors rapidly corrode Kanthal A-1 heating elements and insulating firebricks.",
        remedy:
          "Use a dedicated outdoor gas/wood/raku kiln for Salt, Soda, or Saggar firing.",
      });
    }

    // RULE: Earthenware + High-Fire (Wood / Gas / Salt-Soda Cone 8-13) -> FAILED (Meltdown)
    if (
      input.clayBody === "EARTHENWARE" &&
      (input.firing.method === "WOOD_ANAGAMA" ||
        input.firing.method === "GAS_REDUCTION" ||
        input.firing.method === "SALT_SODA")
    ) {
      issues.push({
        code: "EARTHENWARE_HIGH_FIRE_MELTDOWN",
        severity: "CRITICAL",
        stage: "FIRING",
        title: "Catastrophic Failure: Earthenware Melts at Cone 8-13",
        explanation: `Earthenware matures at Cone 010-04 (903-1063 C). Firing in ${firingSpec.name} (${peakTempC} C) melts the clay into a bloated puddle and ruins kiln shelves.`,
        remedy:
          "Use Electric Oxidation (Cone 06-04), Pit Firing, Saggar, or switch clay body to high-fire Stoneware/Porcelain.",
      });
    } else if (input.clayBody === "EARTHENWARE" && peakTempC >= 1102) {
      issues.push({
        code: "EARTHENWARE_OVERFIRE_BLOATING",
        severity: "CRITICAL",
        stage: "FIRING",
        title: "Earthenware Overfired (Cone 02+): Severe Bloating",
        explanation: `Peak temperature (${peakTempC} C) seals surface pores with glass while iron/impurities still outgas, causing sponge-like bloating.`,
        remedy: "Keep Earthenware firing within Cone 010-04 (903-1063 C).",
      });
    }

    // RULE: Porcelain + Western Raku / Pit Firing -> FAILED (Extreme Thermal Shock)
    if (
      input.clayBody === "PORCELAIN" &&
      (input.firing.method === "WESTERN_RAKU" ||
        input.firing.method === "PIT_OPEN")
    ) {
      issues.push({
        code: "PORCELAIN_THERMAL_SHOCK_FAILURE",
        severity: "CRITICAL",
        stage: "FIRING",
        title: `Thermal Shock Failure: Porcelain in ${firingSpec.name}`,
        explanation:
          "Super-vitreous Porcelain has the lowest thermal shock resistance (5s in Digitalfire flame test); rapid heating/quenching shatters the piece.",
        remedy:
          "Use grogged Stoneware (>=15% grog/kyanite), Earthenware, or Paper Clay for Raku/Pit firing, or fire Porcelain in Electric/Gas/Wood kilns.",
      });
    } else if (
      input.clayBody === "PORCELAIN" &&
      input.firing.method === "OBVARA"
    ) {
      issues.push({
        code: "PORCELAIN_OBVARA_SHOCK_WARNING",
        severity: "WARNING",
        stage: "FIRING",
        title: "High Thermal Shock Risk: Porcelain in Obvara",
        explanation:
          "Double hot-dip (fermented brew + cold water quench) risks shattering Porcelain unless walls are ultra-thin and wide-mouthed.",
        remedy: "Use pale grogged Raku stoneware or keep Porcelain walls very thin and open.",
      });
    }

    // RULE: Western Raku needs thermal-shock clay (>=15% grog)
    if (
      input.firing.method === "WESTERN_RAKU" &&
      input.clayBody === "STONEWARE" &&
      !surf.coarseGrogBody
    ) {
      issues.push({
        code: "RAKU_NEEDS_GROG",
        severity: "WARNING",
        stage: "FIRING",
        title: "Western Raku Needs >=15% Grog / Kyanite",
        explanation:
          "Smooth dense stoneware without open grog/kyanite is prone to thermal shock cracking during hot extraction and water quenching.",
        remedy: "Formulate with >=15% grog/kyanite or use Paper Clay.",
      });
    }

    // RULE: Horsehair Raku needs smooth white/burnished surface in 500-704 C window
    if (input.firing.method === "HORSEHAIR_RAKU") {
      if (surf.coarseGrogBody || surf.surfaceTreatment !== "BURNISHING") {
        issues.push({
          code: "HORSEHAIR_SURFACE_RECOMMENDATION",
          severity: "WARNING",
          stage: "DECORATION",
          title: "Horsehair Raku Needs Smooth Burnished / Terra Sigillata Surface",
          explanation:
            "Sharp calligraphic black carbon lines only stand out crisply on smooth white burnished or terra sigillata surfaces.",
          remedy: "Apply white terra sigillata and burnish before bisque firing.",
        });
      }
      if (peakTempC > 750) {
        issues.push({
          code: "HORSEHAIR_TOO_HOT",
          severity: "WARNING",
          stage: "FIRING",
          title: "Horsehair Temperature Too High (>750 C)",
          explanation:
            "Above 750 C, horsehair burns to white ash instantly without leaving sharp black carbon tracks.",
          remedy: "Extract ware at 500-704 C (target ~680-704 C).",
        });
      }
    }

    // RULE: Stoneware low bisque pinholing
    if (
      input.clayBody === "STONEWARE" &&
      input.firing.lowBisqueCone &&
      surf.glazeMethod !== "NONE"
    ) {
      issues.push({
        code: "STONEWARE_LOW_BISQUE_PINHOLING",
        severity: "WARNING",
        stage: "FIRING",
        title: "Pinholing / Blistering Risk (Low Bisque on Stoneware)",
        explanation:
          "Low Cone 06 bisque fails to finish carbonate/iron pyrite outgassing in stoneware, trapping bubbles under Cone 6 glaze.",
        remedy:
          "Bisque fire higher to Cone 02 (1102 C) and program a drop-and-soak hold (-55 C from peak).",
      });
    }

    // RULE: Underfired high-fire clay bodies (Stoneware/Porcelain in low-fire)
    const underfiredHighBody =
      (input.clayBody === "STONEWARE" || input.clayBody === "PORCELAIN") &&
      peakTempC < claySpec.tempMinC;
    if (underfiredHighBody && firingSpec.category === "HIGH_FIRE_FUNCTIONAL") {
      issues.push({
        code: "HIGH_FIRE_BODY_UNDERFIRED",
        severity: "WARNING",
        stage: "FIRING",
        title: `${claySpec.name} Underfired (${peakTempC} C < ${claySpec.tempMinC} C)`,
        explanation:
          "Body fails to reach USITC vitrification threshold (remains porous with high water absorption).",
        remedy: `Fire within ${claySpec.coneRangeLabel}.`,
      });
    }

    // ------------------------------------------------------------------
    // 6. CRITICAL THERMAL MILESTONES SIMULATION (4 THRESHOLDS)
    // ------------------------------------------------------------------
    const thermalMilestones: ThermalMilestoneReport[] = [];

    // Milestone 1: 0-150 C Physical Water Evaporation (Steam Explosion)
    const notBoneDry =
      sh.moistureState === "plastic" || sh.moistureState === "leather-hard";
    if (notBoneDry || !input.firing.candlingComplete) {
      thermalMilestones.push({
        id: "WATER_EVAP_150C",
        tempLabel: "0-150 C",
        title: "Physical Water Evaporation",
        status: "CRITICAL",
        detail: notBoneDry
          ? `Piece is still ${sh.moistureState} (not bone-dry) -> steam explosion in kiln!`
          : "Slow candling hold skipped -> trapped pore water risks steam blowout.",
      });
      issues.push({
        code: "THERMAL_STEAM_EXPLOSION_150C",
        severity: "CRITICAL",
        stage: "FIRING",
        title: "Steam Explosion Risk at 0-150 C",
        explanation:
          "Free pore water expands massively at 100 C; firing clay that is not bone-dry or skipping candling shatters the vessel.",
        remedy:
          "Dry completely to bone-dry and run a slow 0-150 C candling ramp.",
      });
    } else {
      thermalMilestones.push({
        id: "WATER_EVAP_150C",
        tempLabel: "0-150 C",
        title: "Physical Water Evaporation",
        status: "SAFE",
        detail: "Bone-dry/bisque state + candling complete; pore moisture cleared safely.",
      });
    }

    // Milestone 2: 573 C Quartz Inversion (alpha <-> beta)
    const quartzFastRamp =
      input.firing.heatingRate === "fast" || input.firing.coolingRate === "fast";
    if (quartzFastRamp && peakTempC >= 573) {
      const severeQuartz =
        input.clayBody === "PORCELAIN" || sh.technique === "KURINUKI";
      thermalMilestones.push({
        id: "QUARTZ_INVERSION_573C",
        tempLabel: "573 C",
        title: "Quartz Inversion (alpha <-> beta)",
        status: severeQuartz ? "CRITICAL" : "WARNING",
        detail:
          "Rapid heating/cooling across 573 C triggers sudden quartz volume shift -> dunting cracks.",
      });
      issues.push({
        code: "THERMAL_QUARTZ_DUNTING_573C",
        severity: severeQuartz ? "CRITICAL" : "WARNING",
        stage: "FIRING",
        title: "Quartz Inversion Dunting Risk (573 C)",
        explanation:
          "Reversible alpha-to-beta quartz transformation causes sudden volume change; fast ramp/cooling causes clean razor-edge dunting cracks.",
        remedy: "Slow heating and cooling rate across 500-600 C.",
      });
    } else {
      thermalMilestones.push({
        id: "QUARTZ_INVERSION_573C",
        tempLabel: "573 C",
        title: "Quartz Inversion (alpha <-> beta)",
        status: "SAFE",
        detail: "Controlled ramp safely absorbs quartz crystal expansion/contraction.",
      });
    }

    // Milestone 3: 700-1000+ C Carbonate / Sulfate / Organic Decomposition
    const decompRisk =
      (input.clayBody === "STONEWARE" &&
        input.firing.lowBisqueCone &&
        surf.glazeMethod !== "NONE") ||
      (input.clayBody === "EARTHENWARE" && peakTempC >= 1102) ||
      (claySpec.requiresBurnoutVentilation && !input.firing.ventilationActive);
    if (peakTempC >= 700 && decompRisk) {
      thermalMilestones.push({
        id: "DECOMPOSITION_700_1000C",
        tempLabel: "700-1000+ C",
        title: "Carbonate/Sulfate/Organic Outgassing",
        status:
          input.clayBody === "EARTHENWARE" && peakTempC >= 1102
            ? "CRITICAL"
            : "WARNING",
        detail:
          "CO2/SO2/organic gas trapped under early glass seal -> pinholing, blistering, or bloating.",
      });
    } else {
      thermalMilestones.push({
        id: "DECOMPOSITION_700_1000C",
        tempLabel: "700-1000+ C",
        title: "Carbonate/Sulfate/Organic Outgassing",
        status: "SAFE",
        detail: "Clean CaCO3/sulfate/organic decomposition before glaze/body seals.",
      });
    }

    // Milestone 4: ~226 C Cooling Cristobalite Inversion
    const cristobaliteZone =
      peakTempC >= 1150 &&
      (input.clayBody === "PORCELAIN" || input.clayBody === "STONEWARE");
    if (cristobaliteZone && input.firing.coolingRate === "fast") {
      thermalMilestones.push({
        id: "CRISTOBALITE_COOL_226C",
        tempLabel: "~226 C (Cool)",
        title: "Cristobalite Inversion (~3% Contraction)",
        status: "CRITICAL",
        detail:
          "Fast cooling / opening kiln early at ~226 C causes sudden 3% cristobalite contraction -> dunting!",
      });
      issues.push({
        code: "THERMAL_CRISTOBALITE_DUNTING_226C",
        severity: "CRITICAL",
        stage: "FIRING",
        title: "Cristobalite Dunting at ~226 C Cooling",
        explanation:
          "Porcelain and iron-rich stoneware fired above Cone 3 form cristobalite that contracts ~3% abruptly at 226 C; cracking the kiln lid early snaps the vessel.",
        remedy: "Keep kiln completely closed until natural cooling drops below 100 C.",
      });
    } else {
      thermalMilestones.push({
        id: "CRISTOBALITE_COOL_226C",
        tempLabel: "~226 C (Cool)",
        title: "Cristobalite Inversion (~3% Contraction)",
        status: "SAFE",
        detail: "Natural/controlled cooling prevents thermal shock past 226 C.",
      });
    }

    // ------------------------------------------------------------------
    // 7. FOOD SAFETY, WATERTIGHTNESS & FINAL SHRINKAGE CALCULATION
    // ------------------------------------------------------------------
    const hasGlazeSeal =
      surf.glazeMethod !== "NONE" || input.firing.method === "SALT_SODA";
    const vitrifiedHighFire =
      firingSpec.category === "HIGH_FIRE_FUNCTIONAL" &&
      peakTempC >= claySpec.tempMinC;

    let isWatertight = firingSpec.isWatertightCapable;
    let isFoodSafe = firingSpec.isFoodSafeCapable;

    // Low-fire decorative methods & burnishing are ALWAYS non-food-safe & porous
    if (
      firingSpec.category === "LOW_FIRE_DECORATIVE" ||
      surfaceSpec.leavesPorousNonFoodSafe
    ) {
      isWatertight = false;
      isFoodSafe = false;
    }

    // Earthenware is porous (>=10%) and NOT watertight/food-safe without intact optimal glaze
    if (input.clayBody === "EARTHENWARE") {
      if (!hasGlazeSeal || glazeFitStatus !== "Optimal") {
        isWatertight = false;
        isFoodSafe = false;
        if (!hasGlazeSeal && firingSpec.category === "HIGH_FIRE_FUNCTIONAL") {
          issues.push({
            code: "EARTHENWARE_UNGLAZED_POROUS",
            severity: "WARNING",
            stage: "CLAY_BODY",
            title: "Unglazed Earthenware Is Porous (>=10% Absorption)",
            explanation:
              "Low-fire Earthenware does not vitrify on its own and leaks water without an intact glaze coat.",
            remedy:
              "Apply a lead-free, well-fitted low-fire glaze via Dipping or Pouring for food/water use.",
          });
        }
      }
    }

    // Paper clay leaves fine micropores -> needs intact glaze for watertight/food-safe
    if (input.clayBody === "PAPER_CLAY" && (!hasGlazeSeal || !vitrifiedHighFire)) {
      isWatertight = false;
      isFoodSafe = false;
    }

    // Underfired stoneware/porcelain is not watertight/food-safe
    if (underfiredHighBody) {
      isWatertight = false;
      isFoodSafe = false;
    }

    // Shivering is NEVER food-safe (razor glass splinters!)
    if (glazeFitStatus === "Shivering") {
      isFoodSafe = false;
    }
    // Crazing on porous bodies is not food-safe (bacteria/leaching)
    if (glazeFitStatus === "Crazing" && !claySpec.watertightWithoutGlaze) {
      isFoodSafe = false;
    }

    // Final status rollup
    const hasFatal = issues.some(
      (i) => i.severity === "CRITICAL" || i.severity === "BLOCKED"
    );
    const hasWarning = issues.some((i) => i.severity === "WARNING");

    const status: SimulationStatus = hasFatal
      ? "Failed (Structural/Thermal Failure)"
      : hasWarning
      ? "Warning (Minor Defect)"
      : "Success";

    if (hasFatal) {
      isFoodSafe = false;
      isWatertight = false;
    }

    // Final Shrinkage Calculation (wet -> fired)
    // Low-fire decorative firings undergo drying + partial low-fire shrinkage (~65% of full vitrification shrinkage)
    const effectiveShrinkRate =
      firingSpec.category === "LOW_FIRE_DECORATIVE"
        ? claySpec.defaultShrinkageRate * 0.65
        : claySpec.defaultShrinkageRate;
    const appliedShrinkagePct = Math.round(effectiveShrinkRate * 1000) / 10;

    const firedDimensionsCm = {
      heightCm:
        Math.round(input.wetDimensionsCm.heightCm * (1 - effectiveShrinkRate) * 100) /
        100,
      maxDiameterCm:
        Math.round(
          input.wetDimensionsCm.maxDiameterCm * (1 - effectiveShrinkRate) * 100
        ) / 100,
    };

    const firedTintColor = this.computeFiredVisualColor(
      input,
      status,
      claySpec.firedColor
    );

    const visualSummary = `${claySpec.name} (${shapingSpec.name}) -> ${surfaceSpec.name}/${glazeSpec.name} -> ${firingSpec.name} @ ${peakTempC} C`;

    return {
      status,
      isFoodSafe,
      isWatertight,
      glazeFitStatus,
      peakTempC,
      wetDimensionsCm: input.wetDimensionsCm,
      firedDimensionsCm,
      appliedShrinkagePct,
      thermalMilestones,
      issues,
      safetyWarnings,
      visualSummary,
      firedTintColor,
    };
  }

  private static computeFiredVisualColor(
    input: SimulationInput,
    status: SimulationStatus,
    defaultFired: RgbaColor
  ): RgbaColor {
    if (status === "Failed (Structural/Thermal Failure)") {
      return { r: 0.72, g: 0.28, b: 0.26, a: 1.0 };
    }
    switch (input.firing.method) {
      case "PIT_OPEN":
        return { r: 0.25, g: 0.22, b: 0.20, a: 1.0 }; // fire clouds charcoal
      case "WESTERN_RAKU":
        return { r: 0.34, g: 0.42, b: 0.38, a: 1.0 }; // smoked copper luster
      case "OBVARA":
        return { r: 0.56, g: 0.41, b: 0.24, a: 1.0 }; // scalded golden-brown
      case "HORSEHAIR_RAKU":
        return { r: 0.88, g: 0.86, b: 0.82, a: 1.0 }; // white carbon lines
      case "SAGGAR":
        return { r: 0.80, g: 0.58, b: 0.54, a: 1.0 }; // watercolor peach/pink
      case "GAS_REDUCTION":
        return input.surface.glazeMethod !== "NONE"
          ? { r: 0.52, g: 0.72, b: 0.68, a: 1.0 } // celadon reduction
          : { r: 0.60, g: 0.48, b: 0.38, a: 1.0 };
      case "WOOD_ANAGAMA":
        return { r: 0.50, g: 0.47, b: 0.34, a: 1.0 }; // natural wood ash slag
      case "SALT_SODA":
        return { r: 0.78, g: 0.56, b: 0.36, a: 1.0 }; // orange-peel flashing
      case "ELECTRIC_OXIDATION":
        return input.surface.glazeMethod !== "NONE"
          ? { r: 0.36, g: 0.74, b: 0.78, a: 1.0 } // bright oxidation turquoise
          : defaultFired || OPTICAL_PALETTE.CLAY_STONEWARE;
    }
  }
}
