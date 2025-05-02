import { PredefinedTasksConfig } from "../src/algorithms/PredefinedTasks.js";
import { HoopaAPI } from "../src/HoopaAPI.js";
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";

const config: HoopaConfig = {
    decorators: [TaskGraphDecorator.VITIS_HLS],
    backends: [OffloadingBackend.XRT],
    algorithm: {
        name: HoopaAlgorithm.PREDEFINED_TASKS,
        taskNames: ["convolve2d_rep2", "combthreshold"]
    } as PredefinedTasksConfig,
    target: "targets/ZCU102.yaml"
};

const hoopa = new HoopaAPI("edge_detect", config, "output/local", "edgedetect");
hoopa.runFromStart(false);