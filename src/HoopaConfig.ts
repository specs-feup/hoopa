import { GenFlowConfig } from "extended-task-graph/GenFlowConfig";
import { SubsetTransform } from "extended-task-graph/SubsetTransforms";
import { TransFlowConfig } from "extended-task-graph/TransFlowConfig";
import { HoopaAlgorithmConfig } from "./algorithms/AHoopaAlgorithm.js";

export type HoopaConfig = {
    decorators: TaskGraphDecorator[],
    backends: OffloadingBackend[],
    algorithm: HoopaAlgorithmConfig
}

export enum TaskGraphDecorator {
    VITIS_HLS = "VitisHLS"
}

export enum HoopaAlgorithm {
    SINGLE_HOTSPOT = "alg_single_hotspot",
    PREDEFINED_TASKS = "alg_predefined_tasks"
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