import { AStage } from "extended-task-graph/AStage";
import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { SubsetTransform } from "extended-task-graph/SubsetTransforms";
import { TaskGraph } from "extended-task-graph/TaskGraph";
import { TransFlowConfig } from "extended-task-graph/TransFlowConfig";
import { HoopaConfig } from "./HoopaConfig.js";
import { Offloader } from "./backends/Offloader.js";
import { RegularTask } from "extended-task-graph/RegularTask";
import chalk from "chalk";

export class HoopaAPI extends AStage {
    private config: HoopaConfig;
    private etgApi: ExtendedTaskGraphAPI;

    constructor(topFunctionName: string, config: HoopaConfig, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, `${outputDir}/${appName}`, appName, "Hoopa");
        this.config = config;
        this.etgApi = new ExtendedTaskGraphAPI(topFunctionName, outputDir, appName);
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

        if (this.config.clusterFunction != "<none>") {
            const task = etg.getTaskByName(this.config.clusterFunction) as RegularTask;
            if (task == null) {
                this.logError(`Task ${this.config.clusterFunction} not found in the ETG!`);
                return;
            }

            const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
            offloader.offload(task, this.config.backend);
        }
    }

    private getTaskGraph(skipCodeFlow: boolean): TaskGraph | null {
        if (!skipCodeFlow) {
            this.log("Running code transformation flow...");
            const transConfig = new TransFlowConfig();
            transConfig.transformRecipe = [
                SubsetTransform.ConstantFoldingPropagation
            ]
            this.etgApi.runCodeTransformationFlow(transConfig);
        }

        this.log("Running ETG generation flow...");
        const etg = this.etgApi.runTaskGraphGenerationFlow();
        return etg;
    }
}