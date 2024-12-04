import { SuiteSelector } from "clava-lite-benchmarks/SuiteSelector";
import { HoopaSuiteRunner } from "./HoopaSuiteRunner.js";

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
    outputDir: "output/apps"
}

const runner = new HoopaSuiteRunner();
runner.runScriptForSuite(suite, apps, settings, false);