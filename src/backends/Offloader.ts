import { OffloadingBackend } from "../HoopaConfig.js";
import { AStage } from "extended-task-graph/AStage";
import { ClusterExtractor } from "extended-task-graph/ClusterExtractor";
import { RegularTask } from "extended-task-graph/RegularTask";
import chalk from "chalk";
import { Backend } from "./Backend.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { DefaultBackend } from "./DefaultBackend.js";
import { XrtCxxBackend } from "./XrtCxxBackend.js";
import { XrtCBackend } from "./XrtCBackend.js";

export class Offloader extends AStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("Offloader", topFunctionName, outputDir, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
    }

    public offload(task: RegularTask, backend: OffloadingBackend, debug: boolean = false): boolean {
        this.log(`Offloading cluster majored by task ${task.getUniqueName()} using ${backend}`);

        const extractor = new ClusterExtractor();
        const filename = `cluster_${task.getName()}`;
        const wrapperFun = extractor.extractClusterFromTask(task, filename, "cluster");
        if (wrapperFun == null) {
            this.logError("Cluster extraction failed!");
            return false;
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
                    backendGenerator = Clava.isCxx() ?
                        new XrtCxxBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName()) :
                        new XrtCBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    this.log("Selected backend is XRT");
                    break;
                }
        }
        return backendGenerator.apply(wrapperFun, debug);
    }
}