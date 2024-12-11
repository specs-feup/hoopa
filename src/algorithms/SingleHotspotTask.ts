import { TaskGraph } from "extended-task-graph/TaskGraph";
import { ClusteringAlgorithm } from "./ClusteringAlgorithm.js"
import { HlsReport } from "clava-vitis-integration/HlsReport";
import { Cluster } from "extended-task-graph/Cluster";

export class SingleHotspotTask extends ClusteringAlgorithm {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("SingleHotspotTask", topFunctionName, outputDir, appName);
    }

    public run(etg: TaskGraph): Cluster {
        const tasks = etg.getTasks();
        let currMaxTime = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            if (task.getAnnotation("Vitis") == null) {
                continue;
            }
            const report = task.getAnnotation("Vitis") as HlsReport;
            if (report.execTimeWorst.value > currMaxTime) {
                currMaxTime = report.execTimeWorst.value;
                currMaxTask = task;
            }
        }

        const cluster = new Cluster(etg);
        cluster.addTask(currMaxTask!);
        return cluster;
    }
}