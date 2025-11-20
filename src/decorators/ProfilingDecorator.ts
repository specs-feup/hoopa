import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { ADecorator } from "./ADecorator.js";
import Io from "@specs-feup/lara/api/lara/Io.js";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";

export class ProfilingDecorator extends ADecorator {
    private profiler: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, profiler: string) {
        super(topFunctionName, outputDir, appName, "Profiling", ["profiledExecTime"]);
        this.profiler = profiler;
    }

    public getDotfile(etg: TaskGraph): string {
        const converter = new ProfilingDotConverter();
        return converter.convert(etg);
    }

    public applyCachedDecorations(etg: TaskGraph, filename: string): void {
        this.log(`Applying cached ${this.labels.join(", ")} decorations from ${filename.split("/").pop()}`);

        const decorations = Io.readJson(filename) as Record<string, number>;
        for (const [taskName, percentage] of Object.entries(decorations)) {
            const strippedTaskName = taskName.replace(" (inlined)", "");
            const task = etg.getTaskByName(strippedTaskName);
            if (!task) {
                continue;
            }
            const thisProfilerData: ProfilerData = {
                "profiler": this.profiler,
                "percentage": percentage
            }

            let profData = task.getAnnotation("profiledExecTime");
            if (!profData) {
                profData = [];
            }
            profData.push(thisProfilerData);

            task.setAnnotation("profiledExecTime", profData);
        }
        this.log(`Finished decorating ${Object.entries(decorations).length} tasks with ${this.labels.join(", ")} annotations`);
    }

    protected getAnnotations(task: ConcreteTask): { [key: string]: any } {
        const thisProfilerData: ProfilerData = {
            "profiler": this.profiler,
            "percentage": 0.0
        }
        return { "profiledExecTime": [thisProfilerData] };
    }

    public fillInBlanks(etg: TaskGraph, profiler: string): boolean {
        for (const task of etg.getTasks()) {
            let profData = task.getAnnotation("profiledExecTime") as [ProfilerData];
            if (profData && profData.some(p => p.profiler === profiler && p.percentage > 0.0)) {
                continue;
            }
            const newProfData = {
                "profiler": profiler,
                "percentage": 0.0
            }
            task.setAnnotation("profiledExecTime", [newProfData]);
        }
        const orderedTasks = this.getHierarchicalOrder(etg);
        let filledIn = false;

        for (const task of orderedTasks) {
            let profData = task.getAnnotation("profiledExecTime") as [ProfilerData];
            if (profData && profData.some(p => p.percentage > 0.0)) {
                continue;
            }
            const children = task.getHierarchicalChildren();
            let totalPercentage = 0.0;
            for (const child of children) {
                const childProfData = child.getAnnotation("profiledExecTime") as [ProfilerData];
                if (childProfData) {
                    for (const pdata of childProfData) {
                        if (pdata.profiler === profiler) {
                            totalPercentage += pdata.percentage;
                        }
                    }
                }
            }
            if (totalPercentage > 0.0) {
                const newProfData = {
                    "profiler": profiler,
                    "percentage": totalPercentage
                }
                task.setAnnotation("profiledExecTime", [newProfData]);
                filledIn = true;
                this.log(`Estimated ${totalPercentage.toFixed(2)}% for task ${task.getName()}`);
            }
        }
        return filledIn;
    }

    private getHierarchicalOrder(etg: TaskGraph): ConcreteTask[] {
        const topTask = etg.getTopHierarchicalTask();
        if (!topTask) {
            return [];
        }
        const orderedTasks: ConcreteTask[] = [topTask];
        for (const child of topTask.getHierarchicalChildren()) {
            orderedTasks.push(...this.getHierarchicalLevel(child));
        }
        return orderedTasks.reverse();
    }

    private getHierarchicalLevel(task: ConcreteTask): ConcreteTask[] {
        const orderedTasks: ConcreteTask[] = [...task.getHierarchicalChildren()];
        for (const child of task.getHierarchicalChildren()) {
            orderedTasks.push(...this.getHierarchicalLevel(child));
        }
        return orderedTasks;
    }

}

export type ProfilerData = {
    profiler: string;
    percentage: number;
}

export class ProfilingDotConverter extends DotConverter {

    protected getLabelOfTask(task: RegularTask): string {
        const profData = task.getAnnotation("profiledExecTime") as [ProfilerData];
        if (!profData) {
            return task.getName();
        }
        const allProfilers = profData.map(p => `${p.profiler}: ${p.percentage.toFixed(2)}%`).join("\n");

        const label = `${task.getName()}
        ${allProfilers}`;
        return label;
    }

    protected getLabelOfEdge(): string {
        return "";
    }
}