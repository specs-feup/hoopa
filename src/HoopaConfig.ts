import { GenFlowConfig } from "extended-task-graph/GenFlowConfig";
import { SubsetTransform } from "extended-task-graph/SubsetTransforms";
import { TransFlowConfig } from "extended-task-graph/TransFlowConfig";

export class HoopaConfig {
    backend: OffloadingBackend = OffloadingBackend.XRT;
    clusterFunction: string = "<none>";
}

export enum OffloadingBackend {
    XRT = "XRT",
    OPENCL = "OpenCL"
}

export const DefaultTransFlowConfig = new TransFlowConfig();
DefaultTransFlowConfig.transformRecipe = [
    SubsetTransform.ArrayFlattener,
    SubsetTransform.ConstantFoldingPropagation
];

export const DefaultGenFlowConfig = new GenFlowConfig();
DefaultGenFlowConfig.gatherMetrics = false;