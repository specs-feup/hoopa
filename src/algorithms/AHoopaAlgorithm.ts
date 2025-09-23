import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { AHoopaStage } from "../AHoopaStage.js";
import { HoopaAlgorithm } from "../HoopaConfig.js";

export abstract class AHoopaAlgorithm extends AHoopaStage {
    constructor(algorithmName: string, topFunctionName: string, outputDir: string, appName: string) {
        super(`Alg-${algorithmName}`, topFunctionName, outputDir, appName);
    }

    public abstract run(etg: TaskGraph): Cluster;

    public abstract getName(): string;
}

export type HoopaAlgorithmOptions = {}