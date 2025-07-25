import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";

export class SingleHotspotTask extends AHoopaAlgorithm {
    private config: SingleHotspotTaskOptions;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: SingleHotspotTaskOptions) {
        super("SingleHotspotTask", topFunctionName, outputDir, appName);
        if (config.precision === undefined) {
            config.precision = TimeUnit.MICROSECOND; // Default precision
        }
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log(`Running SingleHotspotTask algorithm with "${this.config.precision}" precision`);
        const tasks = etg.getTasks();
        let currMaxTime = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            if (task.getAnnotation("Vitis") == null) {
                this.logWarning(`Task ${task.getName()} does not have a Vitis annotation, skipping it`);
                continue;
            }
            const report = task.getAnnotation("Vitis") as VitisSynReport;
            const reportTime = convertTimeUnit(report.execTimeWorst.value, report.execTimeWorst.unit, this.config.precision);

            if (reportTime > currMaxTime) {
                currMaxTime = reportTime;
                currMaxTask = task;
            }
        }
        if (currMaxTask == null) {
            this.logError("No tasks with Vitis annotation found, consider applying a Vitis decorator before running the SingleHotspotTask algorithm");
            return new Cluster();
        }

        const cluster = new Cluster();
        cluster.addTask(currMaxTask);
        this.log(`Selected task is ${currMaxTask.getName()}, with a predicted execution time of ${currMaxTime}${this.config.precision}`);

        this.log("SingleHotspotTask algorithm finished");
        return cluster;
    }
}

export type SingleHotspotTaskOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit
}