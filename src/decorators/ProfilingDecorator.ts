import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { ADecorator } from "./ADecorator.js";
import Io from "@specs-feup/lara/api/lara/Io.js";

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
        this.log(`Applying cached ${this.labels.join(", ")} decorations from ${filename}`);

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

    protected getAnnotations(task: RegularTask): { [key: string]: any } {
        const thisProfilerData: ProfilerData = {
            "profiler": this.profiler,
            "percentage": 0.0
        }
        return { "profiledExecTime": [thisProfilerData] };
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