import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { Backend } from "./Backend.js";
import { ClusterInOut } from "extended-task-graph/Cluster";

export class DefaultBackend extends Backend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "Default");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string, inOuts: Map<string, ClusterInOut>, debug: boolean): Scope {
        return wrapperFun.body;
    }
}