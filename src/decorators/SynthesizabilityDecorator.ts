import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { VitisDecorator } from "./VitisDecorator.js";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";

export class SynthesizabilityDecorator extends VitisDecorator {
    constructor(topFunctionName: string, outputDir: string, appName: string, subFolder: string) {
        super(topFunctionName, outputDir, appName, subFolder, "Synth");
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
            "color": isValid ? "forestgreen" : "crimson",
            "errors": report.errors
        };
    }
}

export class SynthesizabilityDotConverter extends DotConverter {

    public getLabelOfTask(task: RegularTask): string {
        const color = task.getAnnotation("color") as string;
        if (!color) {
            return task.getName();
        }

        const label = `${task.getName()}
        ${color === "forestgreen" ? "Valid" : "Invalid"}`;
        return label;
    }
}