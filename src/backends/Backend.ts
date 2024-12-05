import { Call, ExprStmt, FunctionJp, Scope, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import chalk from "chalk";
import { AStage } from "extended-task-graph/AStage";
import { SourceCodeOutput } from "extended-task-graph/OutputDirectories";

export abstract class Backend extends AStage {
    private backendName: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, backendName: string) {
        super(`Backend-${backendName}`, topFunctionName, outputDir, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
        this.backendName = backendName.toLowerCase();
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

        this.generateCode(`${SourceCodeOutput.SRC_PARENT}/clustered_${this.backendName}`);
        return true;
    }

    protected abstract buildBody(wrapperFun: FunctionJp, entrypoint: string): Scope;

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