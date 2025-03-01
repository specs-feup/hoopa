import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmConfig } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";

export class SingleHotspotTask extends AHoopaAlgorithm {
    private config: SingleHotspotTaskConfig;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: SingleHotspotTaskConfig) {
        super("SingleHotspotTask", topFunctionName, outputDir, appName);
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log("Running SingleHotspotTask algorithm");
        const tasks = etg.getTasks();
        let currMaxTime = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            if (task.getAnnotation("Vitis") == null) {
                this.logWarning(`Task ${task.getName()} does not have a Vitis annotation, skipping it`);
                continue;
            }
            const report = task.getAnnotation("Vitis") as VitisSynReport;
            if (report.execTimeWorst.value > currMaxTime) {
                currMaxTime = report.execTimeWorst.value;
                currMaxTask = task;
            }
        }
        if (currMaxTask == null) {
            this.logError("No tasks with Vitis annotation found, consider applying a Vitis decorator before running the SingleHotspotTask algorithm");
            return new Cluster();
        }

        const cluster = new Cluster();
        cluster.addTask(currMaxTask);
        this.log(`Selected task is ${currMaxTask.getName()}, with a predicted execution time of ${currMaxTime}`);

        this.log("SingleHotspotTask algorithm finished");
        return cluster;
    }
}

export type SingleHotspotTaskConfig = HoopaAlgorithmConfig & {}