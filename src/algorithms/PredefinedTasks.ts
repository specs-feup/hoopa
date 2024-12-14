import { TaskGraph } from "extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmConfig } from "./AHoopaAlgorithm.js"
import { HlsReport } from "clava-vitis-integration/HlsReport";
import { Cluster } from "extended-task-graph/Cluster";
import { RegularTask } from "extended-task-graph/RegularTask";

export class PredefinedTasks extends AHoopaAlgorithm {
    private config: PredefinedTasksConfig;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: PredefinedTasksConfig) {
        super("PredefinedTasks", topFunctionName, outputDir, appName);
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log("Running PredefinedTasks algorithm");
        const cluster = new Cluster();

        for (const taskName of this.config.taskNames) {
            const task = etg.getTaskByName(taskName);

            if (task != null && task instanceof RegularTask) {
                cluster.addTask(task);
            }
        }
        this.log("PredefinedTasks algorithm finished");
        return cluster;
    }
}

export type PredefinedTasksConfig = HoopaAlgorithmConfig & {
    taskNames: string[]
}