import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ClusterInOut } from "@specs-feup/extended-task-graph/Cluster";
import { ABackend } from "../ABackend.js";

export class OmpSsBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "OmpSs@FPGA");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string, inOuts: Map<string, ClusterInOut>, debug: boolean): Scope {
        this.logWarning("OmpSs backend not implemented yet, outputting an empty wrapper function");
        const body = ClavaJoinPoints.scope();
        return body;
    }
}