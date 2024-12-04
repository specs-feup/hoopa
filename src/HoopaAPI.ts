import { AStage } from "extended-task-graph/AStage";
import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { SubsetTransform } from "extended-task-graph/SubsetTransforms";
import { TaskGraph } from "extended-task-graph/TaskGraph";
import chalk from "chalk";
import { TransFlowConfig } from "extended-task-graph/TransFlowConfig";

export class HoopaAPI extends AStage {
    constructor(topFunctionName: string, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, outputDir, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
    }

    public run(skipCodeFlow: boolean = true): void {
        const etg = this.getTaskGraph(skipCodeFlow);
        if (!etg) {
            this.logError("ETG generation failed!");
            return;
        }
        this.log("ETG generated successfully!");
        return this.runWithEtg(etg);
    }

    public runWithEtg(etg: TaskGraph): void {
        this.log("Running Hoopa...");
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