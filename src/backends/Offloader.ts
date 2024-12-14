import { OffloadingBackend } from "../HoopaConfig.js";
import { ClusterExtractor } from "extended-task-graph/ClusterExtractor";
import chalk from "chalk";
import { Backend } from "./Backend.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { DefaultBackend } from "./DefaultBackend.js";
import { XrtCxxBackend } from "./XrtCxxBackend.js";
import { XrtCBackend } from "./XrtCBackend.js";
import { AHoopaStage } from "../AHoopaStage.js";
import { Cluster } from "extended-task-graph/Cluster";

export class Offloader extends AHoopaStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("Offloader", topFunctionName, outputDir, appName);
        this.setLabelColor(chalk.magentaBright);
    }

    public offload(cluster: Cluster, backend: OffloadingBackend, debug: boolean = false): boolean {
        this.log(`Offloading cluster ${cluster.getName()} using ${backend}`);

        const extractor = new ClusterExtractor();
        const wrapperFun = extractor.extractCluster(cluster, cluster.getName());
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