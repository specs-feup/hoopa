import { SuiteSelector } from "@specs-feup/clava-lite-benchmarks/SuiteSelector";
import { HoopaSuiteRunner } from "./HoopaSuiteRunner.js";
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";
import { PredefinedTasksConfig } from "../src/algorithms/PredefinedTasks.js";
import { AHoopaAlgorithm } from "../src/algorithms/AHoopaAlgorithm.js";
import { SingleHotspotTaskConfig } from "../src/algorithms/SingleHotspotTask.js";

const suite = SuiteSelector.APPS;
const apps = [
    // "cluster-scenario",
    // "disparity",
    "edgedetect",
    // "scenarioA",
    // "scenarioB",
    // "stresstest",
    // "trivial"
];
const settings = {
    outputDir: "output/apps",
    hoopaConfig: {
        decorators: [TaskGraphDecorator.VITIS_HLS],
        backends: [OffloadingBackend.XRT],
        algorithm: {
            name: HoopaAlgorithm.PREDEFINED_TASKS,
            taskNames: ["convolve2d_rep2", "combthreshold"]
        } as PredefinedTasksConfig,
        target: "targets/ZCU102.yaml"
    } as HoopaConfig
}

const runner = new HoopaSuiteRunner();
runner.runScriptForSuite(suite, apps, settings, false);