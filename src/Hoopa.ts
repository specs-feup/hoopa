import { AStage } from "extended-task-graph/AStage";
import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { TransFlowConfig } from "../../extended-task-graph/dist/src/api/CodeTransformationFlow.js";
import { SubsetTransform } from "extended-task-graph/SubsetTransforms";
import { TaskGraph } from "extended-task-graph/TaskGraph";

export class Hoopa extends AStage {
    constructor(stageName: string, topFunctionName: string, outputDir = "output", appName = "default_app_name") {
        super(stageName, topFunctionName, outputDir, appName, "Hoopa");
    }

    public run(skipCodeFlow: boolean = true): void {
        console.log("Running Hoopa...");

        const etg = this.getTaskGraph(skipCodeFlow);
        if (!etg) {
            this.logError("ETG generation failed!");
            return;
        }
        this.log("ETG generated successfully!");
    }

    private getTaskGraph(skipCodeFlow: boolean): TaskGraph | null {
        const etgApi = new ExtendedTaskGraphAPI(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());

        if (!skipCodeFlow) {
            this.log("Running code transformation flow...");
            const transConfig = new TransFlowConfig();
            transConfig.transformRecipe = [
                SubsetTransform.ConstantFoldingPropagation
            ]
            etgApi.runCodeTransformationFlow(transConfig);
        }

        this.log("Running ETG generation flow...");
        const etg = etgApi.runTaskGraphGenerationFlow();
        return etg;
    }
}