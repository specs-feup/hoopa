import chalk from "chalk";
import { AStage } from "@specs-feup/extended-task-graph/AStage";

export abstract class AHoopaStage extends AStage {
    constructor(stageName: string, topFunctionName: string, outputDir = "output", appName = "default_app_name") {
        super(stageName, topFunctionName, `${outputDir}`, appName, "Hoopa");
        this.setLabelColor(chalk.magentaBright);
    }
}