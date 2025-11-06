import { OffloadingBackend } from "./HoopaConfig.js";
import chalk from "chalk";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { XrtCxxBackend } from "./backends/xrt/XrtCxxBackend.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { XrtCBackend } from "./backends/xrt/XrtCBackend.js";
import { CudaBackend } from "./backends/cuda/CudaBackend.js";
import { OmpSsBackend } from "./backends/ompss/OmpsSsBackend.js";

export class Offloader extends AHoopaStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("Offloader", topFunctionName, outputDir, appName);
        this.setLabelColor(chalk.magentaBright);
    }

    public apply(clusterFun: FunctionJp, bridgeFun: FunctionJp, backend: OffloadingBackend, folderName: string, debug: boolean = false): boolean {
        Clava.pushAst();

        let success = true;
        switch (backend) {
            case OffloadingBackend.AXI:
                {
                    this.logWarning("AXI backend not implemented yet, ignoring it");
                    break;
                }
            case OffloadingBackend.CUDA:
                {
                    const offloader = new CudaBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    success = offloader.apply(clusterFun, bridgeFun, folderName, false);
                    break;
                }
            case OffloadingBackend.OMPSS_FPGA:
                {
                    const offloader = new OmpSsBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    success = offloader.apply(clusterFun, bridgeFun, folderName, false);
                    break;
                }
            case OffloadingBackend.XRT:
                {
                    const offloader = Clava.isCxx() ?
                        new XrtCxxBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName()) :
                        new XrtCBackend(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
                    success = offloader.apply(clusterFun, bridgeFun, folderName, false);
                    break;
                }
            default:
                {
                    this.logError(`Unknown offloading backend ${backend}`);
                    success = false;
                }
        }
        Clava.popAst();
        return success;
    }
}
