import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { Backend } from "./Backend.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

export class XrtCBackend extends Backend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string): Scope {
        const body = ClavaJoinPoints.scope();
        return body;
    }
}