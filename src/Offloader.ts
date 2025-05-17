import { OffloadingBackend } from "./HoopaConfig.js";
import { ClusterExtractor } from "@specs-feup/extended-task-graph/ClusterExtractor";
import chalk from "chalk";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { CpuBackend } from "./backends/CpuBackend.js";
import { XrtCxxBackend } from "./backends/xrt/XrtCxxBackend.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { Cluster, ClusterInOut } from "@specs-feup/extended-task-graph/Cluster";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { RegularTask } from "@specs-feup/extended-task-graph/RegularTask";
import { TaskExtractor } from "@specs-feup/extended-task-graph/TaskExtractor";
import { XrtCBackend } from "./backends/xrt/XrtCBackend.js";
import { CudaBackend } from "./backends/cuda/CudaBackend.js";
import { OmpSsBackend } from "./backends/ompss/OmpsSsBackend.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

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
        const inOuts = cluster.getInOuts();
        const inOutsMap = new Map<string, ClusterInOut>(inOuts);

        switch (backend) {
            case OffloadingBackend.AXI:
                {
                    this.logWarning("AXI backend not implemented yet, ignoring it");
                    return false;
                }
            case OffloadingBackend.CPU:
                {
                    const offloader = new CpuBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, inOutsMap, folderName, false);
                }
            case OffloadingBackend.CUDA:
                {
                    const offloader = new CudaBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, inOutsMap, folderName, false);
                }
            case OffloadingBackend.OMPSS_FPGA:
                {
                    const offloader = new OmpSsBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, inOutsMap, folderName, false);
                }
            case OffloadingBackend.XRT:
                {
                    const offloader = Clava.isCxx() ?
                        new XrtCxxBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName()) :
                        new XrtCBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    return offloader.apply(wrapperFun, inOutsMap, folderName, false);
                }
            default:
                {
                    this.logError(`Unknown offloading backend ${backend}`);
                    return false;
                }
        }
    }
}