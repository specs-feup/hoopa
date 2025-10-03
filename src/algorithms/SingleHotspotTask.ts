import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";
import { ProfilerData } from "../decorators/ProfilingDecorator.js";

export class SingleHotspotTask extends AHoopaAlgorithm {
    public static readonly DEFAULT_PRECISION = TimeUnit.MICROSECOND;
    public static readonly DEFAULT_PERCENTAGE_TARGET = 80;
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
            return new Cluster();
        }

        const cluster = new Cluster();
        cluster.addTask(currMaxTask);
        this.log(`Created cluster with single hotspot task: ${currMaxTask.getName()}`);

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

    private getResourceUsage(report: VitisSynReport): number {
        // TODO: assign weights to each component, which may even be user-defined
        return report.LUT + report.FF + report.BRAM + report.DSP;
    }

    private selectOnFpgaProperty(tasks: ConcreteTask[], useResources: boolean = false): ConcreteTask | null {
        let currMaxCriterionValue = 0;
        let currMaxTask = null;

        for (const task of tasks) {
            if (task.getAnnotation("Vitis") == null) {
                this.logWarning(`Task ${task.getName()} does not have a Vitis annotation, skipping it`);
                continue;
            }
            const report = task.getAnnotation("Vitis") as VitisSynReport;

            const criterionValue = useResources ?
                this.getResourceUsage(report) :
                convertTimeUnit(report.execTimeWorst.value, report.execTimeWorst.unit, this.config.precision || SingleHotspotTask.DEFAULT_PRECISION);

            if (criterionValue > currMaxCriterionValue) {
                currMaxCriterionValue = criterionValue;
                currMaxTask = task;
            }
        }
        if (currMaxTask) {
            if (useResources) {
                this.log(`Selected task ${currMaxTask.getName()} with resource usage ${currMaxCriterionValue}`);
            }
        } else {
            this.logError("No tasks with Vitis annotation found, cannot select hotspot task based on latency or resource usage");
        }
        return currMaxTask;
    }

    private selectOnComputationPercentage(tasks: ConcreteTask[]): ConcreteTask | null {
        if (this.config.profiler == null) {
            this.logError("No profiler specified for computation percentage criterion");
            return null;
        }
        const target = this.config.percentageTarget ?? SingleHotspotTask.DEFAULT_PERCENTAGE_TARGET;
        if (target <= 0 || target > 100) {
            this.logError("Percentage target must be in the range (0, 100]");
            return null;
        }
        let closestTask = null;
        let closestDiff = 100;
        let currPercentage = 0;

        for (const task of tasks) {
            const allProfiles = task.getAnnotation("profiledExecTime") as ProfilerData[];
            if (!allProfiles) {
                continue;
            }
            const thisProfile = allProfiles.find(p => p.profiler === this.config.profiler);
            if (!thisProfile) {
                continue;
            }

            const diff = Math.abs(thisProfile.percentage - target);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestTask = task;
                currPercentage = thisProfile.percentage;
            }
        }

        if (closestTask) {
            this.log(`Selected task ${closestTask.getName()} with computation percentage ${currPercentage.toFixed(2)}% (target was ${target}%)`);
        } else {
            this.logError("No tasks with the specified profiler annotation found, cannot select hotspot task based on computation percentage");
        }
        return closestTask;
    }
}

export enum HotspotCriterion {
    LATENCY = "LATENCY",
    RESOURCES = "RESOURCES",
    COMPUTATION_PERCENTAGE = "COMPUTATION_PERCENTAGE"
}

export type SingleHotspotTaskOptions = HoopaAlgorithmOptions & {
    criterion: HotspotCriterion,
    precision?: TimeUnit,
    profiler?: string,
    percentageTarget?: number
}