import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "./ABackend.js";
import { ClusterInOut } from "@specs-feup/extended-task-graph/Cluster";

export class DefaultBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "Default");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string, inOuts: Map<string, ClusterInOut>, debug: boolean): Scope {
        return wrapperFun.body;
    }
}