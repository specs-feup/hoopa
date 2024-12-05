import { Call, ExprStmt, FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { AStage } from "extended-task-graph/AStage";

export abstract class Backend extends AStage {
    constructor(topFunctionName: string, outputDir: string, appName: string, backendName: string) {
        super(`Backend-${backendName}`, topFunctionName, outputDir, appName, "Hoopa");
    }

    public apply(wrapperFun: FunctionJp): boolean {
        const entrypoint = this.getEntryPoint(wrapperFun);
        if (entrypoint == "<none>") {
            this.log(`Provided wrapper function ${wrapperFun.name} is not in the right format`);
            return false;
        }
        this.log(`Building the backend code around entrypoint ${entrypoint}`);

        const body = this.buildBody(wrapperFun, entrypoint);

        wrapperFun.body.replaceWith(body);
        return true;
    }

    protected abstract buildBody(wrapperFun: FunctionJp, entrypoint: string): Scope;

    private getEntryPoint(wrapperFun: FunctionJp): string {
        const body = wrapperFun.body;
        if (body.children.length != 3) {
            return "<none>";
        }
        if (body.children[0].code != "// Replace this call with the accelerator boilerplate") {
            return "<none>";
        }
        if (!(body.children[1] instanceof ExprStmt) || body.children[1].children.length != 1) {
            return "<none>";
        }
        if (!(body.children[1].children[0] instanceof Call)) {
            return "<none>";
        }
        if (body.children[2].code != "// Wrapper end") {
            return "<none>";
        }
        return (body.children[1].children[0] as Call).name;
    }
}