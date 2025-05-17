import { BuiltinTarget, HoopaAlgorithm, HoopaConfig, OffloadingBackend } from "../src/HoopaConfig.js";
import { PredefinedTasksOptions } from "../src/algorithms/PredefinedTasks.js";
import { HoopaAPI } from "../src/HoopaAPI.js";

const config = new HoopaConfig()
    .addBackend(OffloadingBackend.XRT)
    .addBackend(OffloadingBackend.CPU)
    .addAlgorithm(HoopaAlgorithm.PREDEFINED_TASKS, {
        taskNames: ["convolve2d_rep2", "combthreshold"]
    } as PredefinedTasksOptions)
    .addBuiltinTarget(BuiltinTarget.ZCU102);

const hoopa = new HoopaAPI("edge_detect", config, "outputs/local", "edgedetect");
hoopa.runFromStart(false);