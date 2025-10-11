import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
import { TaskType } from "@specs-feup/extended-task-graph/TaskType";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import Io from "@specs-feup/lara/api/lara/Io.js";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";

export abstract class ADecorator extends AHoopaStage {
    protected labels: string[];

    constructor(topFunctionName: string, outputDir: string, appName: string, decoratorName: string, labels: string[]) {
        super(`Decorator-${decoratorName}`, topFunctionName, outputDir, appName);
        this.labels = labels;
    }

    public getLabels(): string[] {
        return this.labels;
    }

    public decorate(etg: TaskGraph, uniqueFunctionsOnly: boolean = true): [string, { [key: string]: any }][] {
        this.log(`Decorating ETG with ${this.labels.join(", ")} annotations`);

        const annotationsPerTask: [string, { [key: string]: any }][] = [];
        const annotationsPerFunction: [string, { [key: string]: any }][] = [];

        for (const task of etg.getTasks()) {
            let annotations: { [key: string]: any } = {};

            if (uniqueFunctionsOnly) {
                const functionName = task.getCall()?.function.signature;
                if (annotationsPerFunction.some(([name, _]) => name === functionName)) {
                    annotations = annotationsPerFunction.find(([name, _]) => name === functionName)![1];
                }
                else {
                    annotations = this.getAnnotations(task as RegularTask);
                    annotationsPerFunction.push([functionName!, annotations]);
                }
            }
            else {
                annotations = this.getAnnotations(task as RegularTask);
            }

            for (const [label, annotation] of Object.entries(annotations)) {
                task.setAnnotation(label, annotation);
                annotationsPerTask.push([task.getName(), annotations]);
            }
        }
        this.log(`Finished decorating ${annotationsPerTask.length} tasks with ${this.labels.join(", ")} annotations`);
        return annotationsPerTask;
    }

    public applyCachedDecorations(etg: TaskGraph, filename: string): void {
        this.log(`Applying cached ${this.labels.join(", ")} decorations from ${filename.split("/").pop()}`);

        const decorations = Io.readJson(filename);
        for (const [taskName, annotations] of decorations) {
            const task = etg.getTaskByName(taskName);

            if (!task) {
                continue;
            }

            for (const [label, annotation] of Object.entries(annotations)) {
                task.setAnnotation(label, annotation);
            }
        }
        this.log(`Finished decorating ${decorations.length} tasks with ${this.labels.join(", ")} annotations`);
    }

    public abstract getDotfile(etg: TaskGraph): string;

    protected abstract getAnnotations(task: ConcreteTask): { [key: string]: any };

    protected setLabels(labels: string[]): void {
        this.labels = labels;
    }
}