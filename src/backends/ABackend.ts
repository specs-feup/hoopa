import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { FileJp, FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import { AHoopaStage } from "../AHoopaStage.js";
import { FramaC } from "./FramaC.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { writeFileSync } from "fs";
import { TaskGraphGenerationFlow } from "@specs-feup/extended-task-graph/TaskGraphGenerationFlow";

export abstract class ABackend extends AHoopaStage {
    private backendName: string;

    constructor(topFunctionName: string, outputDir: string, appName: string, backendName: string) {
        super(`Backend-${backendName}`, topFunctionName, outputDir, appName);
        this.backendName = backendName.toLowerCase();
    }

    public apply(clusterFun: FunctionJp, bridgeFun: FunctionJp, algName: string = "clustered", debug: boolean = false): boolean {
        this.log(`Applying backend ${this.backendName} to bridge function ${bridgeFun.name}${debug ? " with debug info" : ""}`);

        if (debug) {
            this.log(`Debug mode enabled - do not run the generated code in production`);
        }
        Clava.pushAst(Clava.getProgram());
        const basePath = `${SourceCodeOutput.SRC_PARENT}/${algName}`;
        this.generateCode(`${basePath}/baseline`);
        this.log(`Code generated at ${basePath}/baseline`);

        this.generateFramaCReport(clusterFun, basePath, "baseline");
        this.generateClusterETG(clusterFun, algName);

        [clusterFun, bridgeFun] = this.applyTransforms(clusterFun, bridgeFun, algName);
        [clusterFun, bridgeFun] = this.buildBody(clusterFun, bridgeFun, algName, debug);

        if (debug) {
            this.generateCode(`${basePath}/final-debug`);
            this.log(`Debug code generated at ${basePath}/final-debug`);
        }
        else {
            this.generateCode(`${basePath}/final`);
            this.log(`Code generated at ${basePath}/final`);
            this.logWarning("Writing final code is disabled for now.");
        }
        this.generateFramaCReport(clusterFun, basePath, "final");
        Clava.popAst();

        return true;
    }

    protected applyTransforms(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string): [FunctionJp, FunctionJp] {
        this.log(`No transforms applied for backend ${this.backendName}`);
        return [clusterFun, bridgeFun];
    }

    protected buildBody(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string, debug: boolean): [FunctionJp, FunctionJp] {
        this.log(`No body generation implemented for backend ${this.backendName}`);
        return [clusterFun, bridgeFun];
    }

    protected regenFunction(name: string): FunctionJp {
        return Query.search(FunctionJp, (f) => (f.name == name && f.isImplementation)).first()!;
    }

    private generateFramaCReport(clusterFun: FunctionJp, basePath: string, version: string): void {
        const fullPath = `${this.getOutputDir()}/${basePath}/${version}`;
        const clusFile = clusterFun.getAncestor("file") as FileJp;
        const framaC = new FramaC();
        const framaReport = framaC.getStatsForFile(clusFile, fullPath);
        const framaJSON = JSON.stringify(framaReport, null, 4);

        const framaJSONPath = `${fullPath}/${this.getAppName()}-frama-c-report-${version}.json`;
        writeFileSync(framaJSONPath, framaJSON);
        console.log(`Frama-C report written to: ${framaJSONPath}`);
    }

    private generateClusterETG(clusterFun: FunctionJp, algName: string): void {
        const etgFlow = new TaskGraphGenerationFlow(clusterFun.name, this.getOutputDir(), this.getAppName());
        const etg = etgFlow.buildTaskGraph();
        const subDir = `${algName}_${this.backendName}`;

        etgFlow.analyzeTaskGraph(etg!, subDir);
        etgFlow.dumpTaskGraph(etg!, subDir);
    }
}