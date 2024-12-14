import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "extended-task-graph/TaskGraph";
import { DefaultGenFlowConfig, DefaultTransFlowConfig, HoopaConfig, TaskGraphDecorator } from "./HoopaConfig.js";
import { RegularTask } from "extended-task-graph/RegularTask";
import { AHoopaStage } from "./AHoopaStage.js";
import { EtgPostprocessor } from "./EtgPostprocessor.js";
import { SingleHotspotTask } from "./algorithms/SingleHotspotTask.js";
import { Cluster } from "extended-task-graph/Cluster";

export class HoopaAPI extends AHoopaStage {
    private config: HoopaConfig;
    private etgApi: ExtendedTaskGraphAPI;

    constructor(topFunctionName: string, config: HoopaConfig, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, `${outputDir}/${appName}`, appName);
        this.config = config;
        this.etgApi = new ExtendedTaskGraphAPI(topFunctionName, outputDir, appName);
    }

    public runFromStart(skipCodeFlow: boolean = true): void {
        this.logLine();
        this.log("Running Hoopa for the current AST");

        const etg = this.getTaskGraph(skipCodeFlow);
        if (!etg) {
            this.logError("ETG generation failed!");
            return;
        }
        this.log("ETG generated successfully!");

        this.run(etg);

        this.log("Finished running Hoopa");
        this.logLine();
    }

    public runWithEtg(etg: TaskGraph): void {
        this.logLine();
        this.log("Running Hoopa for a given ETG");

        this.run(etg);

        this.log("Finished running Hoopa");
        this.logLine();
    }

    private getTaskGraph(skipCodeFlow: boolean): TaskGraph | null {
        if (!skipCodeFlow) {
            this.log("Running code transformation flow...");
            this.etgApi.runCodeTransformationFlow(DefaultTransFlowConfig);
        }

        this.log("Running ETG generation flow...");
        const etg = this.etgApi.runTaskGraphGenerationFlow(DefaultGenFlowConfig);
        return etg;
    }

    private run(etg: TaskGraph): void {
        this.log("Running ETG decoration")
        this.decorate(etg, this.config.decorators);

        this.log("Running partitioning and optimization algorithm");
        const cluster = this.runHoopaAlgorithm(etg);

        this.log("Running offloading");
        this.offload(etg, cluster);
    }

    private decorate(etg: TaskGraph, decorators: TaskGraphDecorator[]): void {
        const postProc = new EtgPostprocessor(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());

        for (const decorator of decorators) {
            switch (decorator) {
                case TaskGraphDecorator.VITIS_HLS:
                    postProc.applyVitisDecoration(etg);
                    break;
                default:
                    this.logError(`Unknown decorator: ${decorator}`);
                    break;
            }
        }
    }

    private runHoopaAlgorithm(etg: TaskGraph): Cluster {

        return new Cluster();
    }

    private offload(etg: TaskGraph, cluster: Cluster): void {

    }
}