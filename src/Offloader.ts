import { OffloadingBackend } from "./HoopaConfig.js";
import { ClusterExtractor } from "extended-task-graph/ClusterExtractor";
import chalk from "chalk";
import { Backend } from "./backends/Backend.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { DefaultBackend } from "./backends/DefaultBackend.js";
import { XrtCxxBackend } from "./backends/XrtCxxBackend.js";
import { XrtCBackend } from "./backends/XrtCBackend.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { Cluster } from "extended-task-graph/Cluster";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { RegularTask } from "extended-task-graph/RegularTask";
import { TaskExtractor } from "extended-task-graph/TaskExtractor";

export class Offloader extends AHoopaStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("Offloader", topFunctionName, outputDir, appName);
        this.setLabelColor(chalk.magentaBright);
    }

    public offload(cluster: Cluster, backend: OffloadingBackend, folderName: string, debug: boolean = false): boolean {
        if (cluster.getTasks().length == 0) {
            this.logWarning("Cluster is empty! Skipping offloading...");
            return false;
        }

        let wrapperFun: FunctionJp;
        if (cluster.getTasks().length == 1) {
            const task = cluster.getTasks()[0] as RegularTask
            const extractor = new TaskExtractor()
            wrapperFun = extractor.extractTask(task) as FunctionJp;
        }
        else {
            const extractor = new ClusterExtractor();
            wrapperFun = extractor.extractCluster(cluster) as FunctionJp;
        }

        switch (backend) {
            case OffloadingBackend.XRT:
                {
                    const offloader = Clava.isCxx() ?
                        new XrtCxxBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName()) :
                        new XrtCBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, folderName, false);
                }
            case OffloadingBackend.OPENCL:
                {
                    const offloader = new DefaultBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, folderName, false);
                }
            default:
                {
                    this.logError(`Unknown offloading backend ${backend}`);
                    return false;
                }
        }
    }
}