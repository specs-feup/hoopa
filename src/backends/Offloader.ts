import { OffloadingBackend } from "../HoopaConfig.js";
import { AStage } from "extended-task-graph/AStage";
import { ClusterExtractor } from "extended-task-graph/ClusterExtractor";
import { RegularTask } from "extended-task-graph/RegularTask";
import { SourceCodeOutput } from "extended-task-graph/OutputDirectories";
import chalk from "chalk";

export class Offloader extends AStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("OffloadingBackend", topFunctionName, outputDir, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
    }

    public offload(task: RegularTask, backend: OffloadingBackend) {
        this.log(`Offloading cluster majored by task ${task.getUniqueName()} using ${backend}`);

        const extractor = new ClusterExtractor();
        const filename = `cluster_${task.getName()}`;
        const success = extractor.extractClusterFromTask(task, filename, "cluster");
        if (!success) {
            this.logError("Cluster extraction failed!");
            return;
        }
        this.generateCode(`${SourceCodeOutput.SRC_PARENT}/clustered_nobackend`);

        switch (backend) {
            case OffloadingBackend.OPENCL:
                {
                    this.log("Selected backend is OpenCL");
                    break;
                }
            case OffloadingBackend.XRT:
                {
                    this.log("Selected backend is XRT");
                    break;
                }
        }
    }
}