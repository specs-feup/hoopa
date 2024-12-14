import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { Call, ExprStmt, FunctionJp, Scope, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import { SourceCodeOutput } from "extended-task-graph/OutputDirectories";
import { AHoopaStage } from "../AHoopaStage.js";

export abstract class Backend extends AHoopaStage {
    private backendName: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, backendName: string) {
        super(`Backend-${backendName}`, topFunctionName, outputDir, appName);
        this.backendName = backendName.toLowerCase();
    }

    public apply(wrapperFun: FunctionJp, folderTag: string = "", debug: boolean = false): boolean {
        this.log(`Applying backend ${this.backendName} to wrapper function ${wrapperFun.name}${debug ? " with debug info" : ""}`);

        const entrypoint = this.getEntryPoint(wrapperFun);
        if (entrypoint == "<none>") {
            this.log(`Provided wrapper function ${wrapperFun.name} is not in the right format`);
            return false;
        }
        this.log(`Building the backend code around entrypoint ${entrypoint}`);
        if (debug) {
            this.log(`Debug mode enabled - do not run the generated code in production`);
        }

        Clava.pushAst(Clava.getProgram());
        const body = this.buildBody(wrapperFun, entrypoint, debug);
        wrapperFun.body.replaceWith(body);

        if (debug) {
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/clustered_${folderTag}_${this.backendName}_debug`);
            this.log(`Debug code generated at ${SourceCodeOutput.SRC_PARENT}/clustered_${folderTag}_${this.backendName}_debug`);
        }
        else {
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/clustered_${folderTag}_${this.backendName}`);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/clustered_${folderTag}_${this.backendName}`);
        }
        Clava.popAst();

        return true;
    }

    protected abstract buildBody(wrapperFun: FunctionJp, entrypoint: string, debug: boolean): Scope;

    private getEntryPoint(wrapperFun: FunctionJp): string {
        const body = wrapperFun.body;
        if (body.children.length != 3) {
            return "<none>";
        }
        if (!(body.children[0] instanceof WrapperStmt) || !(body.children[1] instanceof ExprStmt) || !(body.children[2] instanceof WrapperStmt)) {
            return "<none>";
        }
        if (body.children[1].children.length != 1 || !(body.children[1].children[0] instanceof Call)) {
            return "<none>";
        }
        return (body.children[1].children[0] as Call).name;
    }
}