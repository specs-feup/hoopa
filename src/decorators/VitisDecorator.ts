import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { AmdPlatform, ClockUnit, OutputFormat, UncertaintyUnit, VitisHlsConfig } from "@specs-feup/clava-vitis-integration/VitisHlsConfig";
import { ADecorator } from "./ADecorator.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { VitisHls } from "@specs-feup/clava-vitis-integration/VitisHls";
import { VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { ConcreteTask } from "@specs-feup/extended-task-graph/ConcreteTask";
import { Task } from "@specs-feup/extended-task-graph/Task";

export class VitisDecorator extends ADecorator {
    private subfolder: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, subfolder: string, name: string = "Vitis") {
        super(topFunctionName, outputDir, appName, name, ["Vitis"]);
        this.subfolder = subfolder;
    }

    public getDotfile(etg: TaskGraph): string {
        const converter = new VitisDotConverter();
        return converter.convert(etg);
    }

    protected getAnnotations(task: ConcreteTask): { [key: string]: any } {
        const topFunction = task.getName();
        const report = this.generateHlsEstimate(topFunction);

        this.log(`Generated HLS estimate for task ${task.getName()}`);
        return { "Vitis": report };
    }

    private generateHlsEstimate(topFunction: string): VitisSynReport {
        const config = new VitisHlsConfig(topFunction)
            .addSources(Clava.getProgram().files)
            .setClock({ value: 100, unit: ClockUnit.MEGAHERTZ })
            .setUncertainty({ value: 2, unit: UncertaintyUnit.NANOSECOND })
            .setPlatform(AmdPlatform.ZCU102)
            .setOutputFormat(OutputFormat.VITIS_XO);

        const vitis = new VitisHls()
            .setConfig(config)
            .setOutputDir(`${this.getOutputDir()}/${this.subfolder}`);
        return vitis.synthesize();
    }
}

export class VitisDotConverter extends DotConverter {

    public getLabelOfTask(task: RegularTask): string {
        const report = task.getAnnotation("Vitis") as VitisSynReport;
        if (!report) {
            return task.getName();
        }

        const label = `${task.getName()}
        execTime: ${report.execTimeWorst.value.toPrecision(2)}${report.execTimeWorst.unit}
        latency: ${report.latencyWorst} cycles
        maxFreq: ${report.frequencyMaxMHz}MHz
        %FF: ${report.perFF.toPrecision(2)}%
        %LUT: ${report.perLUT.toPrecision(2)}%
        %BRAM: ${report.perBRAM.toPrecision(2)}%
        %DSP: ${report.perDSP.toPrecision(2)}%
        `;
        return label;
    }
}