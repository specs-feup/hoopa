import { RegularTask } from "extended-task-graph/RegularTask";
import { AmdPlatform, ClockUnit, HlsConfig, OutputFormat, UncertaintyUnit } from "clava-vitis-integration/HlsConfig";
import { EtgDecorator } from "./EtgDecorator.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { VitisHls } from "clava-vitis-integration/VitisHls";
import { HlsReport } from "clava-vitis-integration/HlsReport";
import { DotConverter } from "extended-task-graph/DotConverter";
import { TaskGraph } from "extended-task-graph/TaskGraph";

export class VitisDecorator extends EtgDecorator {
    private subfolder: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, subfolder: string) {
        super(topFunctionName, outputDir, appName, "Vitis");
        this.subfolder = subfolder;
    }

    public getDotfile(etg: TaskGraph): string {
        const converter = new VitisDotConverter();
        return converter.convert(etg);
    }

    protected getAnnotation(task: RegularTask): unknown {
        const topFunction = task.getName();
        this.log(`Decorating task ${topFunction} with a Vitis HLS estimation data`);

        const report = this.generateHlsEstimate(topFunction);

        this.log(`Generated HLS estimate for task ${task.getName()}`);
        return report;
    }

    private generateHlsEstimate(topFunction: string): HlsReport {
        const config = new HlsConfig(topFunction)
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
        const report = task.getAnnotation("Vitis") as HlsReport;
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