import { HoopaSuiteRunner } from "./HoopaSuiteRunner.js";
import { BuiltinTarget, HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";
import { APPS } from "@specs-feup/clava-lite-benchmarks/BenchmarkSuites";
import { SingleHotspotTaskOptions } from "../src/algorithms/SingleHotspotTask.js";

const suite = APPS;
const apps = [
    "edgedetect",
];

const config = new HoopaConfig()
    .addDecorator(TaskGraphDecorator.VITIS_HLS)
    .addBackend(OffloadingBackend.XRT)
    .addAlgorithm(HoopaAlgorithm.SINGLE_HOTSPOT, {} as SingleHotspotTaskOptions)
    .addBuiltinTarget(BuiltinTarget.ZCU102)

const runnerConfig = {
    hoopaConfig: config,
    outputDir: "outputs"
};

const runner = new HoopaSuiteRunner();
runner.runScriptForSuite(suite, apps, runnerConfig, false);