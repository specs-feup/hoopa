import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import { AHoopaStage } from "../AHoopaStage.js";
import { FramaC } from "./FramaC.js";

export abstract class ABackend extends AHoopaStage {
    private backendName: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, backendName: string) {
        super(`Backend-${backendName}`, topFunctionName, outputDir, appName);
        this.backendName = backendName.toLowerCase();
    }

    public apply(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string = "clustered", debug: boolean = false): boolean {
        this.log(`Applying backend ${this.backendName} to bridge function ${bridgeFun.name}${debug ? " with debug info" : ""}`);

        if (debug) {
            this.log(`Debug mode enabled - do not run the generated code in production`);
        }
        Clava.pushAst(Clava.getProgram());
        const basePath = `${SourceCodeOutput.SRC_PARENT}/${folderName}`;
        this.generateCode(`${basePath}/baseline`);
        this.log(`Code generated at ${basePath}/baseline`);

        clusterFun = this.applyTransforms(clusterFun, folderName);

        const body = this.buildBody(clusterFun, bridgeFun, debug);
        bridgeFun.body.replaceWith(body);

        if (debug) {
            this.generateCode(`${basePath}/final-debug`);
            this.log(`Debug code generated at ${basePath}/final-debug`);
        }
        else {
            //this.generateCode(`${basePath}/final`);
            //this.log(`Code generated at ${basePath}/final`);
            //this.generateFramaCReport(clusterFun, basePath);
            this.logWarning("Writing final code is disabled for now.");
        }
        Clava.popAst();

        return true;
    }

    protected applyTransforms(clusterFun: FunctionJp, folderName: string): FunctionJp {
        this.log(`No transforms applied for backend ${this.backendName}`);
        return clusterFun;
    }

    protected abstract buildBody(clusterFun: FunctionJp, bridgeFun: FunctionJp, debug: boolean): Scope;
}