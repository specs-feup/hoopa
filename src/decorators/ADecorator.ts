import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
import { TaskType } from "@specs-feup/extended-task-graph/TaskType";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import Io from "@specs-feup/lara/api/lara/Io.js";

export abstract class ADecorator extends AHoopaStage {
    protected label: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, label: string) {
        super(`Decorator-${label}`, topFunctionName, outputDir, appName);
        this.label = label;
    }

    public getLabel(): string {
        return this.label;
    }

    public decorate(etg: TaskGraph): [string, unknown][] {
        console.log(`Decorating ETG with ${this.label} annotations`);

        const aggregate: [string, unknown][] = [];

        for (const task of etg.getTasksByType(TaskType.REGULAR)) {
            const annotation = this.getAnnotation(task as RegularTask);
            task.setAnnotation(this.label, annotation);
            aggregate.push([task.getName(), annotation]);
        }
        console.log(`Finished decorating ${aggregate.length} tasks with ${this.label} annotations`);
        return aggregate;
    }

    public applyCachedDecorations(etg: TaskGraph, filename: string): void {
        this.log(`Applying cached ${this.label} decorations from ${filename}`);

        const decorations = Io.readJson(filename);
        for (const [taskName, annotation] of decorations) {
            const task = etg.getTaskByName(taskName)!;
            task.setAnnotation(this.label, annotation);
        }
        this.log(`Finished decorating ${decorations.length} tasks with ${this.label} annotations`);
    }

    public abstract getDotfile(etg: TaskGraph): string;

    protected abstract getAnnotation(task: RegularTask): unknown;
}