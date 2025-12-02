import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions, HoopaAlgorithmReport } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";

export class PredefinedTasks extends AHoopaAlgorithm {
    private config: PredefinedTasksOptions;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: PredefinedTasksOptions) {
        super("PredefinedTasks", topFunctionName, outputDir, appName);
        this.config = config;
    }

    public run(etg: TaskGraph): [Cluster, HoopaAlgorithmReport] {
        this.log("Running PredefinedTasks algorithm");
        const cluster = new Cluster();

        for (const taskName of this.config.taskNames) {
            const task = etg.getTaskByName(taskName);

            if (task != null && task instanceof RegularTask) {
                this.log(`Adding predefined task ${taskName} to cluster`);
                cluster.addTask(task);
            }
        }
        this.log("PredefinedTasks algorithm finished");
        const report = this.buildReport(cluster);
        return [cluster, report];
    }

    public getName(): string {
        return `alg_PredefinedTasks_${this.config.taskNames.join("_")}`;
    }

    private buildReport(cluster: Cluster): PredefinedTasksReport {
        const report = {
            id: this.getName(),
            cluster: {
                name: cluster.getName(),
                nTopLevelTasks: cluster.getTasks().length,
                nAllTasks: cluster.getAllTasks().length
            }
        }
        return report;
    }
}

export type PredefinedTasksOptions = HoopaAlgorithmOptions & {
    taskNames: string[]
}

export type PredefinedTasksReport = HoopaAlgorithmReport & {
    cluster: {
        name: string,
        nTopLevelTasks: number,
        nAllTasks: number
    }
}