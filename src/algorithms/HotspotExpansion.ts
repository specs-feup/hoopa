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
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Call, FunctionJp, If, Loop, Scope } from "@specs-feup/clava/api/Joinpoints.js";

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

        this.runHls(cluster, this.config.hlsSynthesis || false, this.config.hlsImplementation || false);

        const report = this.createReport(cluster, clusterValue, hotspotTask, hotspotValue);

        this.log("HotspotExpansion algorithm finished");
        return [cluster, report];
    }

    public getName(): string {
        let criterion = "unknown";
        switch (this.config.hotspotCriterion) {
            case HotspotCriterion.LATENCY:
                criterion = "lat";
                break;
            case HotspotCriterion.RESOURCES:
                criterion = "res";
                break;
            case HotspotCriterion.COMPUTATION_PERCENTAGE:
                criterion = "comp%";
                break;
            default:
                break;
        }
        let policies: string[] = [];
        for (const policy of this.config.policies || []) {
            switch (policy) {
                case HotspotExpansionPolicy.ALLOW_MALLOC:
                    policies.push("Malloc");
                    break;
                case HotspotExpansionPolicy.ALLOW_STRUCTS_WITH_POINTERS:
                    policies.push("StructP");
                    break;
                case HotspotExpansionPolicy.ALLOW_POINTER_TO_POINTER:
                    policies.push("P2P");
                    break;
                case HotspotExpansionPolicy.ALLOW_STRUCT_ARG_WITH_POINTER:
                    policies.push("SArgP");
                    break;
                case HotspotExpansionPolicy.ALLOW_OTHERS:
                    policies.push("Others");
                    break;
                default:
                    break;
            }
        }
        if (policies.length === 0) {
            policies.push("NoPolicy");
        }
        return `alg_HotspotExpansion_${criterion}_${policies.join("-")}`;
    }

    private createReport(cluster: Cluster, clusterValue: number, hotspotTask: ConcreteTask, hotspotValue: number): HotspotExpansionReport {
        const tempCluster = new Cluster();
        tempCluster.addTask(hotspotTask);
        const allHotspotTasks = tempCluster.getAllTasks().length;
        const hotspotStatements = ClusterUtils.getNumberOfStatements(tempCluster);
        const hotspotLinesOfCode = ClusterUtils.getLinesOfCode(tempCluster);

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

        const errorToPolicyMap = new Map<HlsError, HotspotExpansionPolicy>();
        errorToPolicyMap.set(HlsError.MALLOC, HotspotExpansionPolicy.ALLOW_MALLOC);
        errorToPolicyMap.set(HlsError.STRUCT_WITH_POINTERS, HotspotExpansionPolicy.ALLOW_STRUCTS_WITH_POINTERS);
        errorToPolicyMap.set(HlsError.POINTER_TO_POINTER, HotspotExpansionPolicy.ALLOW_POINTER_TO_POINTER);
        errorToPolicyMap.set(HlsError.STRUCT_ARG_WITH_POINTER, HotspotExpansionPolicy.ALLOW_STRUCT_ARG_WITH_POINTER);
        errorToPolicyMap.set(HlsError.OTHER, HotspotExpansionPolicy.ALLOW_OTHERS);

        for (const error of errors) {
            const policyOfError = errorToPolicyMap.get(error);
            if (policyOfError === undefined) {
                this.logWarning(`Unknown synthesis error "${error}" for task ${task.getName()}, treating as non-synthesizable`);
                return false;
            }
            if (!policies.includes(policyOfError)) {
                return false;
            }
        }
        // current task is synthesizable, but that doesn't tell us the full picture.
        // due to how Vitis reports errors, the task's subtasks may have errors not reported at the parent level.
        // so now we also check every subtask recursively.
        const children = task.getHierarchicalChildren();
        for (const child of children) {
            const childSynth = this.isSynthesizable(child, policies);
            if (!childSynth) {
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

    private createClusterInward(hotspotTask: ConcreteTask): Cluster {
        const leafTasks = this.getLeafTasks(hotspotTask);
        const validLeafTasks = leafTasks.filter(t => this.isSynthesizable(t, this.config.policies));
        if (validLeafTasks.length === 0) {
            this.logError(`No synthesizable leaf tasks found under task ${hotspotTask.getName()}, cannot create cluster`);
            return new Cluster();
        }

        const clusters = validLeafTasks.map(t => {
            //this.log(`  Creating cluster starting from leaf task ${t.getName()} `);
            const cluster = this.createClusterOutward(t, hotspotTask);
            //this.log(`  Created cluster with ${cluster.getTasks().length} tasks and value ${this.getClusterValue(cluster)} `);
            //this.logLine();
            return cluster;
        });
        this.log(`Created ${clusters.length} clusters from ${validLeafTasks.length} valid leaf tasks`);

        const largestCluster = clusters.reduce((prev, current) => this.compareClusters(prev, current));
        return largestCluster;
    }

    private createClusterOutward(task: ConcreteTask, hotspotTask: ConcreteTask): Cluster {
        const cluster = new Cluster();
        cluster.addTask(task);

        if (task.getId() === hotspotTask.getId()) {
            return cluster;
        }

        const parent = task.getHierarchicalParent() as RegularTask;
        if (parent == null) {
            return cluster;
        }
        if (this.isSynthesizable(parent, this.config.policies)) {
            return this.createClusterOutward(parent, hotspotTask);
        }
        else {
            this.addSiblings(cluster, task);
            return cluster;
        }
    }

    private mapTasksToCalls(siblings: ConcreteTask[]): Map<string, ConcreteTask> {
        const taskMap = new Map<string, ConcreteTask>();

        for (const sibling of siblings) {
            const call = sibling.getCall();
            if (call != null) {
                taskMap.set(call.name, sibling);
            }
        }
        return taskMap;
    }

    private addSiblings(cluster: Cluster, task: ConcreteTask): void {
        const taskCall = task.getCall();
        const taskScope = taskCall?.getAncestor("scope") as Scope;

        if (taskScope.parent instanceof If) {
            this.addSiblingsInIf(cluster, task, taskScope);
        }
        else if (taskScope.parent instanceof Loop) {
            this.addSiblingsInLoop(cluster, task, taskScope);
        }
        else if (taskScope.parent instanceof FunctionJp) {
            this.addSiblingsInFunction(cluster, task, taskScope);
        }
        else {
            throw new Error(`Unexpected scope parent type: ${taskScope.parent.joinPointType} in task ${task.getName()}`);
        }
    }

    private addSiblingsInFunction(cluster: Cluster, task: ConcreteTask, taskScope: Scope): void {
        const siblingTasks = task.getHierarchicalParent()!.getHierarchicalChildren().filter(t => t.getId() !== task.getId());
        const callToTask = this.mapTasksToCalls(siblingTasks);
        const functionStmt = taskScope.parent as FunctionJp;

        const allTasksInScope = Query.searchFrom(taskScope, Call).get()
            .map(c => callToTask.get(c.name))
            .filter(t => t !== undefined) as ConcreteTask[];
        const allValid = this.addSiblingsInScope(cluster, task, allTasksInScope);
        if (!allValid) {
            return;
        }
    }

    private addSiblingsInLoop(cluster: Cluster, task: ConcreteTask, taskScope: Scope): void {
        const siblingTasks = task.getHierarchicalParent()!.getHierarchicalChildren().filter(t => t.getId() !== task.getId());
        const callToTask = this.mapTasksToCalls(siblingTasks);
        const loopStmt = taskScope.parent as Loop;

        const allTasksInScope = Query.searchFrom(taskScope, Call).get()
            .map(c => callToTask.get(c.name))
            .filter(t => t !== undefined) as ConcreteTask[];
        const allValid = this.addSiblingsInScope(cluster, task, allTasksInScope);
        if (!allValid) {
            return;
        }
    }

    private addSiblingsInIf(cluster: Cluster, task: ConcreteTask, taskScope: Scope): void {
        const siblingTasks = task.getHierarchicalParent()!.getHierarchicalChildren().filter(t => t.getId() !== task.getId());
        const callToTask = this.mapTasksToCalls(siblingTasks);
        const ifStmt = taskScope.parent as If;

        const allTasksInScope = Query.searchFrom(taskScope, Call).get()
            .map(c => callToTask.get(c.name))
            .filter(t => t !== undefined) as ConcreteTask[];
        const allValid = this.addSiblingsInScope(cluster, task, allTasksInScope);
        if (!allValid) {
            return;
        }

        const weAreInThen = ifStmt.then.astId === taskScope.astId;
        const otherScopeStmts = weAreInThen ? ifStmt.then : ifStmt.else;
        if (otherScopeStmts != null) {
            const allTasksInOtherScope = Query.searchFrom(otherScopeStmts, Call).get()
                .map(c => callToTask.get(c.name))
                .filter(t => t !== undefined) as ConcreteTask[];

            const allSynthesizable = allTasksInOtherScope.every(t => this.isSynthesizable(t, this.config.policies));
            if (!allSynthesizable) {
                return;
            }
            allTasksInOtherScope.forEach(t => {
                cluster.addTask(t);
            });
            // TODO: add outside tasks
        }
    }

    private addSiblingsInScope(cluster: Cluster, task: ConcreteTask, siblings: ConcreteTask[]): boolean {
        const stack = [task];
        let hasInvalids = false;

        while (stack.length > 0) {
            const currentTask = stack.pop()!;

            const ancestors = currentTask.getIncomingComm().map(c => c.getSource()) as ConcreteTask[];
            for (const ancestor of ancestors) {
                if (cluster.hasTask(ancestor)) {
                    continue;
                }
                if (!this.isSynthesizable(ancestor, this.config.policies)) {
                    hasInvalids = true;
                    continue;
                }
                const ancestorSuccessors = ancestor.getOutgoingComm().map(c => c.getTarget()) as ConcreteTask[];
                const allSuccessorsValid = ancestorSuccessors.every((s) => {
                    const inCluster = cluster.hasTask(s);
                    const isSynth = this.isSynthesizable(s, this.config.policies);
                    const inScope = siblings.find(ss => ss.getId() === s.getId()) !== undefined;
                    return inCluster || (isSynth && inScope);
                });
                if (task.getName() === "cluster_getInterpolatePatch_out1_rep8" || task.getName() === "cluster_getInterpolatePatch_out1_rep16") {
                    console.log(`Adding ancestor ${ancestor.getName()}: allSuccessorsValid = ${allSuccessorsValid}`);
                    console.log("----------------");
                }
                if (allSuccessorsValid) {
                    cluster.addTask(ancestor);
                    //this.log(` -- Added ancestor task ${ancestor.getName()} to cluster`);
                    stack.push(ancestor);
                }
                else {
                    hasInvalids = true;
                }
            }

            const successors = currentTask.getOutgoingComm().map(c => c.getTarget()) as ConcreteTask[];
            for (const successor of successors) {
                if (cluster.hasTask(successor)) {
                    continue;
                }
                if (!this.isSynthesizable(successor, this.config.policies)) {
                    hasInvalids = true;
                    continue;
                }
                const successorAncestors = successor.getIncomingComm().map(c => c.getSource()) as ConcreteTask[];
                const allAncestorsValid = successorAncestors.every((s) => {
                    const inCluster = cluster.hasTask(s);
                    const isSynth = this.isSynthesizable(s, this.config.policies);
                    const inScope = siblings.find(ss => ss.getId() === s.getId()) !== undefined;
                    return inCluster || (isSynth && inScope);
                });
                if (task.getName() === "cluster_getInterpolatePatch_out1_rep8" || task.getName() === "cluster_getInterpolatePatch_out1_rep16") {
                    console.log(`Adding successor ${successor.getName()}: allAncestorsValid = ${allAncestorsValid}`);
                    console.log("----------------");
                }
                if (allAncestorsValid) {
                    cluster.addTask(successor);
                    //this.log(` -- Added successor task ${successor.getName()} to cluster`);
                    stack.push(successor);
                }
                else {
                    hasInvalids = true;
                }
            }
        }
        return !hasInvalids;
    }
}

export enum HotspotExpansionPolicy {
    ALLOW_MALLOC = "ALLOW_MALLOC",
    ALLOW_STRUCTS_WITH_POINTERS = "ALLOW_STRUCTS_WITH_POINTERS",
    ALLOW_POINTER_TO_POINTER = "ALLOW_POINTER_TO_POINTER",
    ALLOW_STRUCT_ARG_WITH_POINTER = "ALLOW_STRUCT_ARG_WITH_POINTER",
    ALLOW_OTHERS = "ALLOW_OTHERS"
}

export type HotspotExpansionOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit,
    policies?: HotspotExpansionPolicy[],
    profiler?: string,
    hotspotCriterion?: HotspotCriterion,
    hotspotTaskName?: string,
    applyTransformations?: boolean,
    hlsSynthesis?: boolean
    hlsImplementation?: boolean
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