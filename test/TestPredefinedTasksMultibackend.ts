import { HoopaAlgorithm, HoopaConfig, OffloadingBackend } from "../src/HoopaConfig.js";
import { PredefinedTasksOptions } from "../src/algorithms/PredefinedTasks.js";
import { HoopaAPI } from "../src/HoopaAPI.js";
import { BuiltinFpgaTarget } from "../src/platforms/BuiltinFpgaPlatforms.js";

const config = new HoopaConfig()
    .addBackend(OffloadingBackend.XRT)
    .addBackend(OffloadingBackend.CPU)
    .addAlgorithm(HoopaAlgorithm.PREDEFINED_TASKS, {
        taskNames: ["convolve2d_rep2", "combthreshold"]
    } as PredefinedTasksOptions)
    .addBuiltinFpgaTarget(BuiltinFpgaTarget.ZCU102);

const hoopa = new HoopaAPI("edge_detect", config, "outputs/local", "edgedetect");
hoopa.runFromStart(false);