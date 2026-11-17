import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import { InitProjectScenario } from "./Test01_InitProjectScenario";
import { ShrinkageCycleScenario } from "./Test02_ShrinkageCycleScenario";
import { ShapeDeformationScenario } from "./Test03_ShapeDeformationScenario";
import { SeriesManagementScenario } from "./Test04_SeriesManagementScenario";
import { OffscreenNavigationScenario } from "./Test05_OffscreenNavigationScenario";

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {
      id: "01_project_initialization",
      typename: InitProjectScenario.getTypeName(),
    },
    {
      id: "02_shrinkage_cycle",
      typename: ShrinkageCycleScenario.getTypeName(),
    },
    {
      id: "03_shape_deformation_coral",
      typename: ShapeDeformationScenario.getTypeName(),
    },
    {
      id: "04_production_series_counter",
      typename: SeriesManagementScenario.getTypeName(),
    },
    {
      id: "05_offscreen_navigation_arrow",
      typename: OffscreenNavigationScenario.getTypeName(),
    },
  ];
}
