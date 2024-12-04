import { SuiteSelector } from "clava-lite-benchmarks/SuiteSelector";
import { runHoopaForBenchmark } from "./BenchmarkRunner.js";

const settings = {
    suite: SuiteSelector.APPS,
    apps: [
        // "cluster-scenario",
        // "disparity",
        "edgedetect",
        // "scenarioA",
        // "scenarioB",
        // "stresstest",
        // "trivial"
    ],
    disableCaching: true,
    outputDir: "output/apps",
}

runHoopaForBenchmark(settings);