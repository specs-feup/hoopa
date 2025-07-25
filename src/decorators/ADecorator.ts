import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
import { TaskType } from "@specs-feup/extended-task-graph/TaskType";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import Io from "@specs-feup/lara/api/lara/Io.js";

export abstract class ADecorator extends AHoopaStage {
    protected labels: string[];

    constructor(topFunctionName: string, outputDir: string, appName: string, decoratorName: string, labels: string[]) {
        super(`Decorator-${decoratorName}`, topFunctionName, outputDir, appName);
        this.labels = labels;
    }

    public getLabels(): string[] {
        return this.labels;
    }

    public decorate(etg: TaskGraph): [string, { [key: string]: any }][] {
        this.log(`Decorating ETG with ${this.labels.join(", ")} annotations`);

        const aggregate: [string, { [key: string]: any }][] = [];

        for (const task of etg.getTasksByType(TaskType.REGULAR)) {
            const annotations = this.getAnnotations(task as RegularTask);

            for (const [label, annotation] of Object.entries(annotations)) {
                task.setAnnotation(label, annotation);
                aggregate.push([task.getName(), annotations]);
            }
        }
        this.log(`Finished decorating ${aggregate.length} tasks with ${this.labels.join(", ")} annotations`);
        return aggregate;
    }

    public applyCachedDecorations(etg: TaskGraph, filename: string): void {
        this.log(`Applying cached ${this.labels.join(", ")} decorations from ${filename}`);

        const decorations = Io.readJson(filename);
        for (const [taskName, annotations] of decorations) {
            const task = etg.getTaskByName(taskName)!;

            for (const [label, annotation] of Object.entries(annotations)) {
                task.setAnnotation(label, annotation);
            }
        }
        this.log(`Finished decorating ${decorations.length} tasks with ${this.labels.join(", ")} annotations`);
    }

    public abstract getDotfile(etg: TaskGraph): string;

    protected abstract getAnnotations(task: RegularTask): { [key: string]: any };

    protected setLabels(labels: string[]): void {
        this.labels = labels;
    }
}