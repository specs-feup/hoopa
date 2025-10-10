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
            "errors": isValid ? [] : this.mapErrors(report.errors)
        };
    }

    private mapErrors(errors: string[]): HlsError[] {
        const mappedErrors = new Set<HlsError>();

        for (const error of errors) {
            const hasMalloc = error.includes("malloc") || error.includes("calloc") || error.includes("free");
            const hasPointerToPointer = error.includes("Pointer to pointer");
            const hasStructArgWithPointer = error.includes("Struct type with pointer");
            const hasOther = !hasMalloc && !hasPointerToPointer && !hasStructArgWithPointer;

            if (hasMalloc) {
                mappedErrors.add(HlsError.MALLOC);
            }
            if (hasPointerToPointer) {
                mappedErrors.add(HlsError.POINTER_TO_POINTER);
            }
            if (hasStructArgWithPointer) {
                mappedErrors.add(HlsError.STRUCT_WITH_STRUCT_POINTER);
            }
            if (hasOther) {
                mappedErrors.add(HlsError.OTHER);
            }
        }
        return Array.from(mappedErrors);
    }
}

export class SynthesizabilityDotConverter extends DotConverter {

    protected getLabelOfTask(task: RegularTask): string {
        const color = task.getAnnotation("color") as string;
        if (!color) {
            return task.getName();
        }
        const errors = task.getAnnotation("errors") as HlsError[];
        if (!errors) {
            return task.getName();
        }

        let errorStr = "";
        if (errors.length > 0) {
            errorStr = "Errors:\n";
            for (const error of errors) {
                errorStr += `- ${error}\n`;
            }
        }
        else {
            errorStr = "No errors.";
        }

        const label = `${task.getName()}
        ${errorStr}
        `;
        return label;
    }

    protected getLabelOfEdge(): string {
        return "";
    }
}

export enum HlsError {
    MALLOC = "malloc",
    POINTER_TO_POINTER = "pointer to pointer",
    STRUCT_WITH_STRUCT_POINTER = "struct with struct pointer",
    OTHER = "other"
}