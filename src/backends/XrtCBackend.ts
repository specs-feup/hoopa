import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { Backend } from "./Backend.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ClusterInOut } from "extended-task-graph/Cluster";

export class XrtCBackend extends Backend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string, inOuts: Map<string, ClusterInOut>, debug: boolean): Scope {
        this.logWarning("XRT C backend not implemented yet, outputting an empty wrapper function");
        const body = ClavaJoinPoints.scope();
        return body;
    }
}