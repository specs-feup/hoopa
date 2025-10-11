import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
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

    public decorate(etg: TaskGraph): [string, { [key: string]: any }][] {
        this.log(`Decorating ETG with ${this.labels.join(", ")} annotations`);

        const annotationsPerTask: [string, { [key: string]: any }][] = [];
        const annotationsPerFunction: [string, { [key: string]: any }][] = [];

        for (const task of etg.getTasks()) {
            let annotations: { [key: string]: any } = {};

            const taskName = task.getName();
            let simplifiedName = taskName;
            let isReplicated = false;

            // Check if functionName matches the pattern baseName_rep1_rep2_..._repN

            const match = taskName.match(/^(.*?)(?:_rep\d+)+$/);
            if (match) {
                simplifiedName = match[1];
                isReplicated = true;
            }

            if (isReplicated) {
                if (annotationsPerFunction.some(([name, _]) => name === simplifiedName)) {
                    annotations = annotationsPerFunction.find(([name, _]) => name === simplifiedName)![1];
                } else {
                    annotations = this.getAnnotations(task);
                    annotationsPerFunction.push([simplifiedName, annotations]);
                }
            }
            else {
                annotations = this.getAnnotations(task);
            }

            for (const [label, annotation] of Object.entries(annotations)) {
                task.setAnnotation(label, annotation);
                annotationsPerTask.push([taskName, annotations]);
            }
        }
        this.log(`Finished decorating ${annotationsPerTask.length} tasks with ${this.labels.join(", ")} annotations`);
        return annotationsPerTask;
    }

    public applyCachedDecorations(etg: TaskGraph, filename: string): void {
        this.log(`Applying cached ${this.labels.join(", ")} decorations from ${filename.split("/").pop()}`);

        const decorations = Io.readJson(filename);
        for (const [taskName, annotations] of decorations) {
            const tasks = etg.getTasks().filter(t => t.getName().startsWith(taskName));

            tasks.forEach(task => {
                for (const [label, annotation] of Object.entries(annotations)) {
                    task.setAnnotation(label, annotation);
                }
            });
        }
        this.log(`Finished decorating ${decorations.length} tasks with ${this.labels.join(", ")} annotations`);
    }

    public abstract getDotfile(etg: TaskGraph): string;

    protected abstract getAnnotations(task: ConcreteTask): { [key: string]: any };

    protected setLabels(labels: string[]): void {
        this.labels = labels;
    }
}