import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions, HoopaAlgorithmReport } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { ProfilerData } from "../decorators/ProfilingDecorator.js";

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
        const report = this.config.profiler == undefined ?
            this.buildReport(cluster) :
            this.buildReport(cluster, this.config.profiler);
        return [cluster, report];
    }

    public getName(): string {
        return `alg_PredefinedTasks_${this.config.taskNames.join("_")}`;
    }

    private buildReport(cluster: Cluster, profiler?: string): PredefinedTasksReport {
        let value = -1;
        if (profiler) {
            value = cluster.getTasks()
                .map((task) => {
                    const allProfiles = task.getAnnotation("profiledExecTime") as ProfilerData[];
                    if (!allProfiles) {
                        return 0;
                    }
                    const thisProfile = allProfiles.find(p => p.profiler === this.config.profiler);
                    if (!thisProfile) {
                        return 0;
                    }
                    return thisProfile.percentage;
                })
                .reduce((a, b) => a + b, 0);
        }
        const name = cluster.getTasks().map(t => t.getName()).join("+");

        const report = {
            id: this.getName(),
            cluster: {
                name: name,
                nTopLevelTasks: cluster.getTasks().length,
                nAllTasks: cluster.getAllTasks().length,
                value: value
            }
        }
        return report;
    }
}

export type PredefinedTasksOptions = HoopaAlgorithmOptions & {
    taskNames: string[],
    profiler?: string
}

export type PredefinedTasksReport = HoopaAlgorithmReport & {
    cluster: {
        name: string,
        nTopLevelTasks: number,
        nAllTasks: number,
        value: number
    }
}