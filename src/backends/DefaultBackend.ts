import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { Backend } from "./Backend.js";

export class DefaultBackend extends Backend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "Default");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string): Scope {
        return wrapperFun.body;
    }
}