import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { AHoopaStage } from "../AHoopaStage.js";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { VitisHls } from "@specs-feup/clava-vitis-integration/VitisHls";
import { VitisHlsConfig } from "@specs-feup/clava-vitis-integration/VitisHlsConfig";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { TimeUnit, VitisImplReport, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";
import { HoopaOutputDirectory } from "../HoopaConfig.js";

export abstract class AHoopaAlgorithm extends AHoopaStage {
    constructor(algorithmName: string, topFunctionName: string, outputDir: string, appName: string) {
        super(`Alg-${algorithmName}`, topFunctionName, outputDir, appName);
    }

    public abstract run(etg: TaskGraph): [Cluster, HoopaAlgorithmReport];

    public abstract getName(): string;

    protected runHls(cluster: Cluster, doSynthesis: boolean, doImplementation: boolean) {
        const tasks = cluster.getTasks();
        if (tasks.length > 1) {
            this.logWarning("HLS synthesis/implementation is only supported for clusters with a single task. Skipping HLS step.");
            this.logWarning("Feature will be improved in future releases.");
            return;
        }

        const task = tasks[0] as RegularTask;
        const fun = task.getFunction();

        const vitis = new VitisHls();
        const config = new VitisHlsConfig(fun.name)
            .addSources(Clava.getProgram().files);
        vitis.setConfig(config);

        if (doSynthesis && !doImplementation) {
            this.log("Running Vitis HLS synthesis...");
            const synReport = vitis.synthesize();
            this.saveReport(synReport, "synthesis");
        }
        if (doImplementation) {
            this.log("Running Vitis HLS implementation...");
            const [synReport, implReport] = vitis.implement();
            this.saveReport(synReport, "synthesis");
            this.saveReport(implReport, "implementation");
        }
    }

    private saveReport(report: VitisSynReport | VitisImplReport, type: string): void {
        const filename = `vitis_${type}_${this.getName()}.json`;
        const json = JSON.stringify(report, null, 4);

        this.saveToFileInSubfolder(json, filename, HoopaOutputDirectory.CLUSTERS);
        this.log(`Saved ${type} report to ${HoopaOutputDirectory.CLUSTERS}/${filename}`);
    }
}

export type HoopaAlgorithmOptions = {}

export type HoopaAlgorithmReport = { id: string }