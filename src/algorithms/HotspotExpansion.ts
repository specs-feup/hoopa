import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";
import { HotspotCriterion, SingleHotspotTask, SingleHotspotTaskOptions } from "./SingleHotspotTask.js";
import { FpgaResourceUsageEstimator } from "./FpgaResourceUsageEstimator.js";
import { ProfilerData } from "../decorators/ProfilingDecorator.js";

export class HotspotExpansion extends AHoopaAlgorithm {
    private config: HotspotExpansionOptions;

    constructor(topFunctionName: string, outputDir: string, appName: string, config: HotspotExpansionOptions) {
        super("HotspotExpansion", topFunctionName, outputDir, appName);
        if (config.precision === undefined) {
            config.precision = TimeUnit.MICROSECOND;
        }
        if (config.policies === undefined) {
            config.policies = [];
        }
        if (config.hotspotCriterion === undefined && config.hotspotTaskName === undefined) {
            this.logWarning("No hotspot criterion or hotspot task name provided, defaulting to LATENCY criterion");
            config.hotspotCriterion = HotspotCriterion.LATENCY;
        }
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log(`Running with "${this.config.precision}" precision and policies: ${this.config.policies!.length > 0 ? this.config.policies!.join(", ") : "none"}`);

        const [hotspotTask, hotspotValue] = this.findHotspotTask(etg);
        if (hotspotTask === null) {
            this.logError("No hotspot task found, cannot proceed with HotspotExpansion algorithm");
            return new Cluster();
        }

        const cluster = this.createClusterInward(hotspotTask);

        this.log(`Final cluster has ${cluster.getTasks().length} tasks:`);
        cluster.getTasks().forEach((task) => {
            this.log(` - ${task.getName()}`);
        });

        this.log("HotspotExpansion algorithm finished");
        return cluster;
    }

    private findHotspotTask(etg: TaskGraph): [ConcreteTask | null, number] {
        let hotspotTask: ConcreteTask | null = null;
        let hotspotValue = -1;

        if (this.config.hotspotTaskName !== undefined) {
            [hotspotTask, hotspotValue] = this.getHotspotOnName(etg, this.config.hotspotTaskName);
            if (hotspotTask === null) {
                return [null, 0];
            }
            this.log(`Hotspot task was user-provided: ${hotspotTask.getName()}`);
            return [hotspotTask, hotspotValue];
        }

        const criterion = this.config.hotspotCriterion!;
        switch (criterion) {
            case HotspotCriterion.LATENCY:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg, criterion);
                this.log(`Hotspot task selected based on LATENCY criterion: ${hotspotTask?.getName()} at ${hotspotValue}${this.config.precision}`);
                break;
            case HotspotCriterion.RESOURCES:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg, criterion);
                this.log(`Hotspot task selected based on RESOURCES criterion: ${hotspotTask?.getName()} with ${hotspotValue} resources`);
                break;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg, criterion);
                this.log(`Hotspot task selected based on COMPUTATION_PERCENTAGE criterion: ${hotspotTask?.getName()} at ${hotspotValue}%`);
                break;
            default:
                this.logError(`Unknown hotspot criterion: ${this.config.hotspotCriterion}`);
                this.logError(`Valid options are: ${Object.values(HotspotCriterion).join(", ")}`);
                this.logError("Alternatively, provide a hotspot task name directly");
                return [null, 0];
        }
        if (hotspotTask == null) {
            return [null, 0];
        }
        return [hotspotTask, hotspotValue];
    }

    private getHotspotOnName(etg: TaskGraph, name: string): [ConcreteTask | null, number] {
        const task = etg.getTasks().find(t => t.getName() === name);
        if (task === undefined) {
            this.logError(`Could not find task with name ${name}`);
            return [null, 0];
        }
        return [task, this.getTaskExecTime(task)];
    }

    private getHotspotDynamic(etg: TaskGraph, criterion: HotspotCriterion): [ConcreteTask | null, number] {
        if (criterion == HotspotCriterion.COMPUTATION_PERCENTAGE && this.config.profiler === undefined) {
            this.logError(`No profiler specified for ${HotspotCriterion.COMPUTATION_PERCENTAGE} hotspot criterion`);
            return [null, 0];
        }
        const profiler = this.config.profiler || "<n/a>";

        const topFunction = this.getTopFunctionName();
        const outDir = this.getOutputDir();
        const appName = this.getAppName();
        const algConfig = { criterion: criterion, profiler: profiler } as SingleHotspotTaskOptions;

        const alg = new SingleHotspotTask(topFunction, outDir, appName, algConfig);
        const result = alg.run(etg);
        if (result.getTasks().length === 0) {
            this.logError("SingleHotspotTask algorithm did not return any hotspot task");
            return [null, 0];
        }

        const hotspotTask = result.getTasks()[0];
        let hotspotValue = -1;
        switch (criterion) {
            case HotspotCriterion.LATENCY:
                hotspotValue = this.getTaskExecTime(hotspotTask);
                break;
            case HotspotCriterion.RESOURCES:
                hotspotValue = this.getTaskResourceUsage(hotspotTask);
                break;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                hotspotValue = this.getTaskComputationPercentage(hotspotTask, profiler);
                break;
        }
        return [hotspotTask, hotspotValue];
    }

    private isSynthesizable(task: ConcreteTask, policies: HotspotExpansionPolicy[] = []): boolean {
        if (task.getAnnotation("Vitis") == null) {
            return false;
        }
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        if (policies.length === 0) {
            return report.errors.length === 0;
        }

        let allClear = true;
        for (const error of report.errors) {
            allClear = allClear && this.checkTaskForPolicy(error, policies);
        }
        return allClear;
    }

    private checkTaskForPolicy(error: string, policies: HotspotExpansionPolicy[]): boolean {
        for (const policy of policies) {
            switch (policy) {
                case HotspotExpansionPolicy.ALLOW_MALLOC:
                    {
                        if (error.includes("malloc") || error.includes("free")) {
                            return true;
                        }

                    }
                case HotspotExpansionPolicy.ALLOW_INDIRECT_POINTERS:
                    {
                        if (error.includes("pointer type")) {
                            return true;
                        }
                    }
                case HotspotExpansionPolicy.ALLOW_OTHERS:
                    {
                        if (!error.includes("malloc") && !error.includes("free") && !error.includes("pointer type")) {
                            return true;
                        }
                    }
            }
        }
        return false;
    }

    private getTaskExecTime(task: ConcreteTask): number {
        if (task.getAnnotation("Vitis") == null) {
            return 0;
        }
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        return convertTimeUnit(report.execTimeWorst.value, report.execTimeWorst.unit, this.config.precision);
    }

    private getTaskResourceUsage(task: ConcreteTask): number {
        if (task.getAnnotation("Vitis") == null) {
            return 0;
        }
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        return FpgaResourceUsageEstimator.estimateUsage(report);
    }

    private getTaskComputationPercentage(task: ConcreteTask, profiler: string): number {
        const allProfiles = task.getAnnotation("profiledExecTime") as ProfilerData[];
        if (!allProfiles) {
            return 0;
        }
        const thisProfile = allProfiles.find(p => p.profiler === profiler);
        if (!thisProfile) {
            return 0;
        }
        return thisProfile.percentage;
    }

    private getLeafTasks(topLevel: ConcreteTask): ConcreteTask[] {
        const leaves: ConcreteTask[] = [];

        if (topLevel.getHierarchicalChildren().length === 0) {
            leaves.push(topLevel);
            return leaves;
        }

        for (const child of topLevel.getHierarchicalChildren()) {
            const childLeaves = this.getLeafTasks(child);
            leaves.push(...childLeaves);
        }
        return leaves;
    }

    private compareClusters(c1: Cluster, c2: Cluster): Cluster {
        if (c1.getTasks().length >= c2.getTasks().length) {
            return c1;
        }
        return c2;
    }

    private createClusterInward(task: ConcreteTask): Cluster {
        if (this.isSynthesizable(task, this.config.policies)) {
            this.log(`Task ${task.getName()} is synthesizable, creating cluster`);
            const cluster = new Cluster();
            cluster.addTask(task);
            return cluster;
        }

        const leafTasks = this.getLeafTasks(task);
        const validLeafTasks = leafTasks.filter(t => this.isSynthesizable(t, this.config.policies));
        if (validLeafTasks.length === 0) {
            this.logError(`No synthesizable leaf tasks found under task ${task.getName()}, cannot create cluster`);
            return new Cluster();
        }

        const clusters = validLeafTasks.map(t => {
            this.log(`Creating cluster starting from leaf task ${t.getName()}`);
            const cluster = this.createClusterOutward(t);
            this.log(`Created cluster with ${cluster.getTasks().length} tasks starting from leaf task ${t.getName()}`);
            return cluster;
        });
        this.log(`Created ${clusters.length} clusters from ${validLeafTasks.length} valid leaf tasks`);

        const largestCluster = clusters.reduce((prev, current) => this.compareClusters(prev, current));
        return largestCluster;
    }

    private createClusterOutward(task: ConcreteTask): Cluster {
        const cluster = new Cluster();
        cluster.addTask(task);
        this.log(` - Added task ${task.getName()} to cluster`);

        const parent = task.getHierarchicalParent();
        if (parent == null) {
            this.log(" - No more parent tasks to expand");
            return cluster;
        }
        // if the hier parent is synthesizable, we move up the cluster up one level
        if (this.isSynthesizable(parent, this.config.policies)) {
            this.log(` - Parent task ${parent.getName()} is synthesizable, replacing cluster with it`);
            return this.createClusterOutward(parent);
        }
        // else, we try to add siblings at the same hierarchical level
        else {
            this.log(` - Parent task ${parent.getName()} is not synthesizable, checking siblings`);

            task.getIncomingComm().forEach((comm) => {
                const sibling = comm.getSource() instanceof ConcreteTask ? comm.getSource() as ConcreteTask : null;
                if (sibling == null) {
                    return;
                }
                if (sibling.getId() === task.getId()) {
                    return;
                }
                if (this.isSynthesizable(sibling)) {
                    cluster.addTask(sibling);
                    this.log(` - Added sibling task ${sibling.getName()} to cluster`);
                }
            });
            task.getOutgoingComm().forEach((comm) => {
                const sibling = comm.getTarget() instanceof ConcreteTask ? comm.getTarget() as ConcreteTask : null;
                if (sibling == null) {
                    return;
                }
                if (sibling.getId() === task.getId()) {
                    return;
                }
                if (this.isSynthesizable(sibling)) {
                    cluster.addTask(sibling);
                    this.log(` - Added sibling task ${sibling.getName()} to cluster`);
                }
            });
        }
        return cluster;
    }

    public getName(): string {
        return `HotspotExpansion_${this.config.policies?.join("_")}`;
    }
}

export enum HotspotExpansionPolicy {
    ALLOW_MALLOC = "ALLOW_MALLOC",
    ALLOW_INDIRECT_POINTERS = "ALLOW_INDIRECT_POINTERS",
    ALLOW_OTHERS = "ALLOW_OTHERS"
}

export type HotspotExpansionOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit,
    policies?: HotspotExpansionPolicy[],
    profiler?: string,
    hotspotCriterion?: HotspotCriterion,
    hotspotTaskName?: string
}