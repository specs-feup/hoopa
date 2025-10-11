import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaAlgorithm, HoopaAlgorithmOptions, HoopaAlgorithmReport } from "./AHoopaAlgorithm.js"
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { ClusterUtils } from "@specs-feup/extended-task-graph/ClusterUtils";
import { convertTimeUnit, TimeUnit, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";
import { HotspotCriterion, SingleHotspotTask, SingleHotspotTaskOptions } from "./SingleHotspotTask.js";
import { FpgaResourceUsageEstimator } from "./FpgaResourceUsageEstimator.js";
import { ProfilerData } from "../decorators/ProfilingDecorator.js";
import { HlsError } from "../decorators/SynthesizabilityDecorator.js";

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

    public run(etg: TaskGraph): [Cluster, HoopaAlgorithmReport] {
        this.log(`Running with "${this.config.precision}" precision and policies: ${this.config.policies!.length > 0 ? this.config.policies!.join(", ") : "none"}`);

        const [hotspotTask, hotspotValue] = this.findHotspotTask(etg);
        if (hotspotTask === null) {
            this.logError("No hotspot task found, cannot proceed with HotspotExpansion algorithm");
            return [new Cluster(), { id: this.getName() }];
        }

        const cluster = this.createClusterInward(hotspotTask);
        const clusterValue = this.getClusterValue(cluster);

        this.log(`Final cluster has ${cluster.getTasks().length} tasks:`);
        cluster.getTasks().forEach((task) => {
            this.log(` - ${task.getName()}`);
        });
        this.log(`Cluster total value: ${this.getValueWithUnit(clusterValue)}`);
        this.log(`Hotspot task "${hotspotTask.getName()}" value: ${this.getValueWithUnit(hotspotValue)}`);
        this.log(`Cluster represents ${(clusterValue / hotspotValue * 100).toFixed(2)}% of the hotspot task value`);

        const report = this.createReport(cluster, hotspotTask, hotspotValue);

        this.log("HotspotExpansion algorithm finished");
        return [cluster, report];
    }

    public getName(): string {
        return `HotspotExpansion_${this.config.hotspotCriterion}_${this.config.policies?.join("_")}`;
    }

    private createReport(cluster: Cluster, hotspotTask: ConcreteTask, hotspotValue: number): HotspotExpansionReport {
        const tempCluster = new Cluster();
        tempCluster.addTask(hotspotTask);
        const allHotspotTasks = tempCluster.getAllTasks().length;
        const hotspotStatements = ClusterUtils.getNumberOfStatements(tempCluster);
        const hotspotLinesOfCode = ClusterUtils.getLinesOfCode(tempCluster);

        const clusterValue = this.getClusterValue(cluster);
        const clusterStatements = ClusterUtils.getNumberOfStatements(cluster);
        const clusterLinesOfCode = ClusterUtils.getLinesOfCode(cluster);
        const percentageOfHotspotStatements = hotspotStatements > 0 ? (clusterStatements / hotspotStatements * 100) : 0;
        const percentageOfHotspotLinesOfCode = hotspotLinesOfCode > 0 ? (clusterLinesOfCode / hotspotLinesOfCode * 100) : 0;

        const report: HotspotExpansionReport = {
            id: this.getName(),
            hotspot: {
                name: hotspotTask.getName(),
                nTopLevelTasks: 1,
                nAllTasks: allHotspotTasks,
                value: hotspotValue,
                nStatements: hotspotStatements,
                linesOfCode: hotspotLinesOfCode
            },
            cluster: {
                name: cluster.getName(),
                nTopLevelTasks: cluster.getTasks().length,
                nAllTasks: cluster.getAllTasks().length,
                value: clusterValue,
                nStatements: clusterStatements,
                linesOfCode: clusterLinesOfCode,
                percentageOfHotspot: hotspotValue > 0 ? (clusterValue / hotspotValue * 100) : 0,
                percentageOfHotspotTasks: allHotspotTasks > 0 ? (cluster.getAllTasks().length / allHotspotTasks * 100) : 0,
                percentageOfHotspotStatements: percentageOfHotspotStatements,
                percentageOfHotspotLinesOfCode: percentageOfHotspotLinesOfCode,
                topLevelTasks: cluster.getTasks().map(t => ({
                    name: t.getName(),
                    value: this.getTaskValue(t),
                })),
                allTasks: cluster.getAllTasks().map(t => ({
                    name: t.getName(),
                    value: this.getTaskValue(t),
                    criterion: this.config.hotspotCriterion!
                }))
            },
            algorithm: {
                criterion: this.config.hotspotCriterion!,
                policies: this.config.policies,
                precision: this.config.precision
            }
        };
        return report;
    }

    private getValueWithUnit(value: number): string {
        switch (this.config.hotspotCriterion) {
            case HotspotCriterion.LATENCY:
                return `${value}${this.config.precision}`;
            case HotspotCriterion.RESOURCES:
                return `${value}% resource usage`;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                return `${value}% of total computation`;
            default:
                return `${value} (unknown unit)`;
        }
    }

    private findHotspotTask(etg: TaskGraph): [ConcreteTask | null, number] {
        let hotspotTask: ConcreteTask | null = null;
        let hotspotValue = -1;

        if (this.config.hotspotTaskName !== undefined) {
            [hotspotTask, hotspotValue] = this.getHotspotOnName(etg, this.config.hotspotTaskName);
            if (hotspotTask === null) {
                return [null, 0];
            }
            this.log(`Hotspot task was user - provided: ${hotspotTask.getName()} `);
            return [hotspotTask, hotspotValue];
        }

        const criterion = this.config.hotspotCriterion!;
        switch (criterion) {
            case HotspotCriterion.LATENCY:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg);
                this.log(`Hotspot task selected based on LATENCY criterion: ${hotspotTask?.getName()} at ${hotspotValue}${this.config.precision} `);
                break;
            case HotspotCriterion.RESOURCES:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg);
                this.log(`Hotspot task selected based on RESOURCES criterion: ${hotspotTask?.getName()} with ${hotspotValue} resources`);
                break;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                [hotspotTask, hotspotValue] = this.getHotspotDynamic(etg);
                this.log(`Hotspot task selected based on COMPUTATION_PERCENTAGE criterion: ${hotspotTask?.getName()} at ${hotspotValue}% `);
                break;
            default:
                this.logError(`Unknown hotspot criterion: ${this.config.hotspotCriterion} `);
                this.logError(`Valid options are: ${Object.values(HotspotCriterion).join(", ")} `);
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
            this.logError(`Could not find task with name ${name} `);
            return [null, 0];
        }
        return [task, this.getTaskLatency(task)];
    }

    private getHotspotDynamic(etg: TaskGraph): [ConcreteTask | null, number] {
        const criterion = this.config.hotspotCriterion!;
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
        const [result, _] = alg.run(etg);
        if (result.getTasks().length === 0) {
            this.logError("SingleHotspotTask algorithm did not return any hotspot task");
            return [null, 0];
        }

        const hotspotTask = result.getTasks()[0];
        const hotspotValue = this.getTaskValue(hotspotTask,);
        return [hotspotTask, hotspotValue];
    }

    private getTaskValue(task: ConcreteTask): number {
        const criterion = this.config.hotspotCriterion!;
        switch (criterion) {
            case HotspotCriterion.LATENCY:
                return this.getTaskLatency(task);
            case HotspotCriterion.RESOURCES:
                return this.getTaskResourceUsage(task);
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                return this.getTaskComputationPercentage(task, this.config.profiler!);
            default:
                return 0;
        }
    }

    private getClusterValue(cluster: Cluster): number {
        return cluster.getTasks().reduce((sum, task) => sum + this.getTaskValue(task), 0);
    }

    private isSynthesizable(task: ConcreteTask, policies: HotspotExpansionPolicy[] = []): boolean {
        if (task.getAnnotation("SynthErrors") == null) {
            return false;
        }
        const errors = task.getAnnotation("SynthErrors") as HlsError[];
        if (errors.length === 0) {
            return true;
        }

        for (const error of errors) {
            switch (error) {
                case HlsError.MALLOC:
                    if (!policies.includes(HotspotExpansionPolicy.ALLOW_MALLOC)) {
                        return false;
                    }
                    break;
                case HlsError.POINTER_TO_POINTER:
                    if (!policies.includes(HotspotExpansionPolicy.ALLOW_POINTER_TO_POINTER)) {
                        return false;
                    }
                    break;
                case HlsError.STRUCT_ARG_WITH_POINTER:
                    if (!policies.includes(HotspotExpansionPolicy.ALLOW_STRUCT_ARG_WITH_POINTER)) {
                        return false;
                    }
                    break;
                case HlsError.OTHER:
                    if (!policies.includes(HotspotExpansionPolicy.ALLOW_OTHERS)) {
                        return false;
                    }
                    break;
                default:
                    this.logWarning(`Unknown HLS error type: ${error}, assuming not synthesizable`);
                    return false;
            }
        }
        return true;
    }

    private getTaskLatency(task: ConcreteTask): number {
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
        const sumC1 = this.getClusterValue(c1);
        const sumC2 = this.getClusterValue(c2);

        return sumC1 >= sumC2 ? c1 : c2;
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
            this.log(`Creating cluster starting from leaf task ${t.getName()} `);
            const cluster = this.createClusterOutward(t);
            this.log(`Created cluster with ${cluster.getTasks().length} tasks starting from leaf task ${t.getName()} `);
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
            const siblings = parent.getHierarchicalChildren().filter(t => t.getId() !== task.getId());
            const noChangeLimit = siblings.length + 1;
            let noChangeCount = 0;

            while (noChangeCount < noChangeLimit) {
                const nextTask = siblings.shift()!;
                if (nextTask === undefined) {
                    break;
                }
                // task is already in cluster
                if (cluster.hasTask(nextTask)) {
                    continue;
                }
                // task is not synthesizable, and it can never be added
                if (!this.isSynthesizable(nextTask, this.config.policies)) {
                    continue;
                }
                else {
                    // task is synthesizable, we try to add it
                    if (cluster.canAdd(nextTask)) {
                        cluster.addTask(nextTask);
                        this.log(` - Added sibling task ${nextTask.getName()} to cluster`);
                        noChangeCount = 0;
                    }
                    // if we cannot add it, we may need to wait for other siblings to be added first
                    // we put it back at the end of the list, and hope it can be added later
                    else {
                        noChangeCount++;
                        siblings.push(task);
                    }
                }
            };
        }
        return cluster;
    }
}

export enum HotspotExpansionPolicy {
    ALLOW_MALLOC = "ALLOW_MALLOC",
    ALLOW_POINTER_TO_POINTER = "ALLOW_POINTER_TO_POINTER",
    ALLOW_STRUCT_ARG_WITH_POINTER = "ALLOW_STRUCT_ARG_WITH_POINTER",
    ALLOW_OTHERS = "ALLOW_OTHERS"
}

export type HotspotExpansionOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit,
    policies?: HotspotExpansionPolicy[],
    profiler?: string,
    hotspotCriterion?: HotspotCriterion,
    hotspotTaskName?: string
}

export type HotspotExpansionReport = HoopaAlgorithmReport & {
    hotspot: {
        // generic cluster info
        name: string,
        nTopLevelTasks: number, // always 1
        nAllTasks: number,
        value: number,
        nStatements: number,
        linesOfCode: number
    },
    cluster: {
        // generic cluster info, same as the hotspot
        name: string,
        nTopLevelTasks: number,
        nAllTasks: number,
        value: number,
        nStatements: number,
        linesOfCode: number,
        // cluster value as a percentage of the hotspot task value
        percentageOfHotspot: number,
        percentageOfHotspotTasks: number,
        percentageOfHotspotStatements: number,
        percentageOfHotspotLinesOfCode: number,
        // list of top-level tasks in the cluster, with their individual value
        topLevelTasks: { name: string, value: number }[],
        allTasks: { name: string, value: number, criterion: HotspotCriterion }[]
    },
    algorithm: {
        criterion: HotspotCriterion,
        policies?: HotspotExpansionPolicy[],
        precision: TimeUnit
    }
}