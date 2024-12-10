import { RegularTask } from "extended-task-graph/RegularTask";
import { AmdPlatform, ClockUnit, HlsConfig, OutputFormat, UncertaintyUnit } from "clava-vitis-integration/HlsConfig";
import { EtgDecorator } from "./EtgDecorator.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { VitisHls } from "clava-vitis-integration/VitisHls";
import { HlsReport } from "clava-vitis-integration/HlsReport";

export class VitisDecorator extends EtgDecorator {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "Vitis");
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

        const vitis = new VitisHls().setConfig(config);
        return vitis.synthesize();
    }
}