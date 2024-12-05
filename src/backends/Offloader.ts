import { OffloadingBackend } from "../HoopaConfig.js";
import { AStage } from "extended-task-graph/AStage";
import { ClusterExtractor } from "extended-task-graph/ClusterExtractor";
import { RegularTask } from "extended-task-graph/RegularTask";
import { SourceCodeOutput } from "extended-task-graph/OutputDirectories";
import chalk from "chalk";
import { Backend } from "./Backend.js";
import { XrtBackend } from "./XrtBackend.js";
import { DefaultBackend } from "./DefaultBackend.js";

export class Offloader extends AStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("Offloader", topFunctionName, outputDir, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
    }

    public offload(task: RegularTask, backend: OffloadingBackend) {
        this.log(`Offloading cluster majored by task ${task.getUniqueName()} using ${backend}`);

        const extractor = new ClusterExtractor();
        const filename = `cluster_${task.getName()}`;
        const wrapperFun = extractor.extractClusterFromTask(task, filename, "cluster");
        if (wrapperFun == null) {
            this.logError("Cluster extraction failed!");
            return;
        }
        let backendGenerator: Backend = new DefaultBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());

        switch (backend) {
            case OffloadingBackend.OPENCL:
                {

                    this.log("Selected backend is OpenCL");
                    break;
                }
            case OffloadingBackend.XRT:
                {
                    backendGenerator = new XrtBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    this.log("Selected backend is XRT");
                    break;
                }
        }
        backendGenerator.apply(wrapperFun);
    }
}