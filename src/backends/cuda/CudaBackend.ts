import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";

export class CudaBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "CUDA");
    }

    protected buildBody(clusterFun: FunctionJp, bridgeFun: FunctionJp, debug: boolean): Scope {
        this.logWarning("CUDA backend not implemented yet, outputting the same bridge function");
        return bridgeFun.body!;
    }
}