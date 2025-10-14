import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { VitisDecorator } from "./VitisDecorator.js";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";
import { Task } from "@specs-feup/extended-task-graph/Task";

export class SynthesizabilityDecorator extends VitisDecorator {
    constructor(topFunctionName: string, outputDir: string, appName: string, subFolder: string) {
        super(topFunctionName, outputDir, appName, subFolder, "Synth");
        this.setLabels(["SynthColor", "SynthErrors"]);
    }

    public getDotfile(etg: TaskGraph): string {
        const converter = new SynthesizabilityDotConverter();
        return converter.convert(etg);
    }

    protected getAnnotations(task: ConcreteTask): { [key: string]: any } {
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        if (!report) {
            this.log(`Task ${task.getName()} has no Vitis data, marking as non-synthesizable`);
            return this.buildErrorsForTask(task as ConcreteTask);
        }
        const isValid = report.valid;
        const errors = isValid ? [] : (report.errors.length > 0 ? this.mapErrors(report.errors) : [HlsError.STRUCT_WITH_POINTERS]);

        this.log(`Annotated task ${task.getName()} with synthesizability data: ${isValid ? "valid" : "invalid"}`);
        return {
            "SynthColor": isValid ? "lightgreen" : "lightcoral",
            "SynthErrors": errors
        };
    }

    private buildErrorsForTask(task: ConcreteTask): { [key: string]: any } {
        const errors: HlsError[] = [];
        const mallocFunctions = ["malloc", "calloc", "free"];
        const taskName = task.getName();

        if (mallocFunctions.includes(taskName)) {
            errors.push(HlsError.MALLOC);
        }
        if (errors.length === 0) {
            errors.push(HlsError.OTHER);
        }
        return { "SynthColor": SynthesizabilityDotColors.INVALID, "SynthErrors": errors };
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
                // insert newlines every 20 characters (without breaking words)
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

    protected getColorForTask(task: Task, index: number): string {
        const color = task.getAnnotation("SynthColor") as string;
        return color ?? SynthesizabilityDotColors.UNKNOWN;
    }
}

export enum SynthesizabilityDotColors {
    VALID = "lightgreen",
    INVALID = "lightcoral",
    UNKNOWN = "gray"
}

export enum HlsError {
    MALLOC = "Memory de/allocation",
    STRUCT_WITH_POINTERS = "Struct pointer with pointer field",
    POINTER_TO_POINTER = "Pointer to pointer",
    STRUCT_ARG_WITH_POINTER = "Struct arg with pointer field",
    OTHER = "Other"
}