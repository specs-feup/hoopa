import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { VitisDecorator } from "./VitisDecorator.js";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";

export class SynthesizabilityDecorator extends VitisDecorator {
    constructor(topFunctionName: string, outputDir: string, appName: string, subFolder: string) {
        super(topFunctionName, outputDir, appName, subFolder, "Synth");
        this.setLabels(["color", "errors"]);
    }

    public getDotfile(etg: TaskGraph): string {
        const converter = new SynthesizabilityDotConverter();
        return converter.convert(etg);
    }

    protected getAnnotations(task: RegularTask): { [key: string]: any } {
        const topFunction = task.getName();
        this.log(`Decorating task ${topFunction} with synthesizability data`);

        const report = task.getAnnotation("Vitis") as VitisSynReport;
        if (!report) {
            this.logError(`No Vitis report found for task ${topFunction}, cannot generate synthesizability estimate.`);
            return { "color": "gray" };
        }
        const isValid = report.errors.length === 0;

        this.log(`Annotated task ${task.getName()} with synthesizability data: ${isValid ? "valid" : "invalid"}`);
        return {
            "color": isValid ? "lightgreen" : "lightcoral",
            "errors": report.errors
        };
    }
}

export class SynthesizabilityDotConverter extends DotConverter {

    protected getLabelOfTask(task: RegularTask): string {
        const color = task.getAnnotation("color") as string;
        if (!color) {
            return task.getName();
        }

        const label = `${task.getName()}
        ${color === "lightgreen" ? "Valid" : "Invalid"}`;
        return label;
    }

    protected getLabelOfEdge(): string {
        return "";
    }
}