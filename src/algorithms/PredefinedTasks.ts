import { TaskGraph } from "extended-task-graph/TaskGraph";
import { ClusteringAlgorithm, ClusteringAlgorithmConfig } from "./ClusteringAlgorithm.js"
import { HlsReport } from "clava-vitis-integration/HlsReport";
import { Cluster } from "extended-task-graph/Cluster";
import { RegularTask } from "extended-task-graph/RegularTask";

export class PredefinedTasks extends ClusteringAlgorithm {
    private config: PredefinedTasksConfig;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: PredefinedTasksConfig) {
        super("SingleHotspotTask", topFunctionName, outputDir, appName);
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        const cluster = new Cluster();

        for (const taskName of this.config.taskNames) {
            const task = etg.getTaskByName(taskName);

            if (task != null && task instanceof RegularTask) {
                cluster.addTask(task);
            }
        }
        return cluster;
    }
}

export type PredefinedTasksConfig = ClusteringAlgorithmConfig & {
    taskNames: string[]
}