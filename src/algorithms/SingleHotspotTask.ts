import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";

export class SingleHotspotTask extends AHoopaAlgorithm {
    private config: SingleHotspotTaskOptions;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: SingleHotspotTaskOptions) {
        super("SingleHotspotTask", topFunctionName, outputDir, appName);
        if (config.precision === undefined) {
            config.precision = TimeUnit.MICROSECOND;
        }
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log(`Running SingleHotspotTask algorithm with "${this.config.precision}" precision`);
        const tasks = etg.getTasks();
        let currMaxTime = 0;
        let currMaxTask = null;

        switch (this.config.criterion) {
            case HotspotCriterion.LATENCY:
                currMaxTask = this.selectOnLatency(tasks);
                break;
            case HotspotCriterion.RESOURCES:
                currMaxTask = this.selectOnResources(tasks);
                break;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                currMaxTask = this.selectOnComputationPercentage(tasks);
                break;
            default:
                this.logError(`Unknown hotspot criterion: ${this.config.criterion}`);
                return new Cluster();
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

    public getName(): string {
        return `SingleHotspotTask_${this.config.precision}`;
    }

    private selectOnLatency(tasks: ConcreteTask[]): ConcreteTask | null {
        return this.selectOnFpgaProperty(tasks);
    }

    private selectOnResources(tasks: ConcreteTask[]): ConcreteTask | null {
        return this.selectOnFpgaProperty(tasks, true);
    }

    private selectOnFpgaProperty(tasks: ConcreteTask[], useResources: boolean = false): ConcreteTask | null {
        let currMaxTime = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            if (task.getAnnotation("Vitis") == null) {
                this.logWarning(`Task ${task.getName()} does not have a Vitis annotation, skipping it`);
                continue;
            }
            const report = task.getAnnotation("Vitis") as VitisSynReport;

            const criterionValue = useResources ?
                this.getResourceUsage(report) :
                convertTimeUnit(report.execTimeWorst.value, report.execTimeWorst.unit, this.config.precision);

            if (criterionValue > currMaxTime) {
                currMaxTime = criterionValue;
                currMaxTask = task;
            }
        }
        return currMaxTask;
    }

    private getResourceUsage(report: VitisSynReport): number {
        // TODO: assign weights to each component, which may even be user-defined
        return report.LUT + report.FF + report.BRAM + report.DSP;
    }

    private selectOnComputationPercentage(tasks: ConcreteTask[]): ConcreteTask | null {
        return null;
    }
}

export enum HotspotCriterion {
    LATENCY = "LATENCY",
    RESOURCES = "RESOURCES",
    COMPUTATION_PERCENTAGE = "COMPUTATION_PERCENTAGE"
}

export type SingleHotspotTaskOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit,
    criterion: HotspotCriterion
}