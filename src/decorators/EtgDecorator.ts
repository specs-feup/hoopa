import { TaskGraph } from "extended-task-graph/TaskGraph";
import { AHoopaStage } from "../AHoopaStage.js";
import { TaskType } from "extended-task-graph/TaskType";
import { RegularTask } from "extended-task-graph/RegularTask";

export abstract class EtgDecorator extends AHoopaStage {
    protected label: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, label: string) {
        super(`${label}Decorator`, topFunctionName, outputDir, appName);
        this.label = label;
    }

    public getLabel(): string {
        return this.label;
    }

    public decorate(etg: TaskGraph): void {
        for (const task of etg.getTasksByType(TaskType.REGULAR)) {
            const annotation = this.getAnnotation(task as RegularTask);
            task.setAnnotation(this.label, annotation);
        }
    }

    protected abstract getAnnotation(task: RegularTask): unknown;
}