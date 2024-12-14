import { TaskGraph } from "extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
import { Cluster } from "extended-task-graph/Cluster";
import { HoopaAlgorithm } from "../HoopaConfig.js";

export abstract class ClusteringAlgorithm extends AHoopaStage {
    constructor(algorithmName: string, topFunctionName: string, outputDir: string, appName: string) {
        super(`Alg-${algorithmName}`, topFunctionName, outputDir, appName);
    }

    public abstract run(etg: TaskGraph): Cluster;

}

export type ClusteringAlgorithmConfig = {
    name: HoopaAlgorithm
}