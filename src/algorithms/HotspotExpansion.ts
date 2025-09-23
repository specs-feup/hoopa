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
        if (config.policies === undefined) {
            config.policies = [];
        }
        this.config = config;
    }

    public run(etg: TaskGraph): Cluster {
        this.log(`Running with "${this.config.precision}" precision and policies: ${this.config.policies!.length > 0 ? this.config.policies!.join(", ") : "none"}`);

        const hotspot = this.findHotspotTask(etg);
        if (hotspot[0] === null) {
            this.logError("No hotspot task found, cannot proceed with HotspotExpansion algorithm");
            return new Cluster();
        }
        const hotspotTask = hotspot[0];
        const hotspotTime = hotspot[1];

        this.log(`Hotspot task is ${hotspotTask.getName()}, with latency ${hotspotTime}${this.config.precision}`);

        const cluster = this.createCluster(hotspotTask);

        this.log(`Final cluster has ${cluster.getTasks().length} tasks:`);
        cluster.getTasks().forEach((task) => {
            this.log(` - ${task.getName()}`);
        });

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
            this.logError("No tasks with Vitis annotation found, consider applying a Vitis decorator before running the HotspotExpansion algorithm");
            return [null, 0];
        }
        return [currMaxTask, currMaxTime];
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

    private createCluster(task: ConcreteTask): Cluster {
        const cluster = new Cluster();
        cluster.addTask(task);
        this.log(`Added hotspot task ${task.getName()} to cluster`);

        const parent = task.getHierarchicalParent();
        if (parent == null) {
            this.log("No more parent tasks to expand");
            return cluster;
        }
        // if the hier parent is synthesizable, we move up the cluster up one level
        if (this.isSynthesizable(parent, this.config.policies)) {
            this.log(`Parent task ${parent.getName()} is synthesizable, replacing cluster with it`);
            return this.createCluster(parent);
        }
        // else, we try to add siblings at the same hierarchical level
        else {
            this.log(`Parent task ${parent.getName()} is not synthesizable, attempting to add siblings`);

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
                    this.log(`Added sibling task ${sibling.getName()} to cluster`);
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
                    this.log(`Added sibling task ${sibling.getName()} to cluster`);
                }
            });
        }
        return cluster;
    }

    public getName(): string {
        return `HotspotExpansion_${this.config.policies?.join("_")}`;;
    }
}

export enum HotspotExpansionPolicy {
    ALLOW_MALLOC = "ALLOW_MALLOC",
    ALLOW_INDIRECT_POINTERS = "ALLOW_INDIRECT_POINTERS",
    ALLOW_OTHERS = "ALLOW_OTHERS"
}

export type HotspotExpansionOptions = HoopaAlgorithmOptions & {
    precision: TimeUnit,
    policies?: HotspotExpansionPolicy[]
}