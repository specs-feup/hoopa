import { SuiteSelector } from "clava-lite-benchmarks/SuiteSelector";
import { HoopaSuiteRunner } from "./HoopaSuiteRunner.js";
import { HoopaConfig } from "../src/HoopaConfig.js";

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
    hoopaConfig: new HoopaConfig()
}
settings.hoopaConfig.clusterFunction = "combthreshold";

const runner = new HoopaSuiteRunner();
runner.runScriptForSuite(suite, apps, settings, false);