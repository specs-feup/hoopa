import { SuiteSelector } from "clava-lite-benchmarks/SuiteSelector";
import { HoopaSuiteRunner } from "./HoopaSuiteRunner.js";
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";
import { PredefinedTasksConfig } from "../src/algorithms/PredefinedTasks.js";
import { ClusteringAlgorithm } from "../src/algorithms/ClusteringAlgorithm.js";

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
            algorithm: HoopaAlgorithm.PREDEFINED_TASKS,
            taskNames: ["convolve2d_rep2", "combthreshold"]
        } as PredefinedTasksConfig
    } as HoopaConfig
}

const runner = new HoopaSuiteRunner();
runner.runScriptForSuite(suite, apps, settings, false);