import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";

export class HotspotExpansion extends AHoopaAlgorithm {
    private config: HotspotExpansionOptions;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: HotspotExpansionOptions) {
        super("HotspotExpansion", topFunctionName, outputDir, appName);
        if (config.precision === undefined) {
            config.precision = TimeUnit.MICROSECOND;
        }
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log(`Running HotspotExpansion algorithm with "${this.config.precision}" precision`);
        const cluster = new Cluster();

        const hotspot = this.findHotspotTask(etg);
        if (hotspot[0] === null) {
            this.logError("No hotspot task found, cannot proceed with HotspotExpansion algorithm");
            return new Cluster();
        }
        const hotspotTask = hotspot[0];
        const hotspotTime = hotspot[1];

        cluster.addTask(hotspotTask);
        this.log(`Selected task is ${hotspotTask.getName()}, with a predicted execution time of ${hotspotTime}${this.config.precision}`);

        this.expandCluster(cluster);

        this.log("HotspotExpansion algorithm finished");
        return cluster;
    }

    private findHotspotTask(etg: TaskGraph): [ConcreteTask | null, number] {
        const tasks = etg.getTasks();
        let currMaxTime = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            const synthesizability = this.isSynthesizable(task);
            if (!synthesizability) {
                continue;
            }

            const reportTime = this.getTaskExecTime(task);
            if (reportTime > currMaxTime) {
                currMaxTime = reportTime;
                currMaxTask = task;
            }
        }
        if (currMaxTask == null) {
            this.logError("No tasks with Vitis annotation found, consider applying a Vitis decorator before running the SingleHotspotTask algorithm");
            return [null, 0];
        }
        return [currMaxTask, currMaxTime];
    }

    private isSynthesizable(task: ConcreteTask): boolean {
        if (task.getAnnotation("Vitis") == null) {
            return false;
        }
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        return report.errors.length === 0;
    }

    private getTaskExecTime(task: ConcreteTask): number {
        if (task.getAnnotation("Vitis") == null) {
            return 0;
        }
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        return convertTimeUnit(report.execTimeWorst.value, report.execTimeWorst.unit, this.config.precision);
    }

    private expandCluster(cluster: Cluster): void {

    }
}

export type HotspotExpansionOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit
}