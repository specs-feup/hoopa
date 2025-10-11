import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { VitisDecorator } from "./VitisDecorator.js";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";

export class SynthesizabilityDecorator extends VitisDecorator {
    constructor(topFunctionName: string, outputDir: string, appName: string, subFolder: string) {
        super(topFunctionName, outputDir, appName, subFolder, "Synth");
        this.setLabels(["SynthColor", "SynthErrors"]);
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
            return { "SynthColor": "gray", "SynthErrors": [HlsError.OTHER] };
        }
        const isValid = report.errors.length === 0;

        this.log(`Annotated task ${task.getName()} with synthesizability data: ${isValid ? "valid" : "invalid"}`);
        return {
            "SynthColor": isValid ? "lightgreen" : "lightcoral",
            "SynthErrors": isValid ? [] : this.mapErrors(report.errors)
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
                mappedErrors.add(HlsError.STRUCT_ARG_WITH_POINTER);
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
        //const color = task.getAnnotation("SynthColor") as string ?? "gray";
        const errors = task.getAnnotation("SynthErrors") as HlsError[] ?? [];

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
    STRUCT_ARG_WITH_POINTER = "struct argument with struct pointer inside",
    OTHER = "other"
}