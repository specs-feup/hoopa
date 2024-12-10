import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "extended-task-graph/TaskGraph";
import { DefaultGenFlowConfig, DefaultTransFlowConfig, HoopaConfig } from "./HoopaConfig.js";
import { Offloader } from "./backends/Offloader.js";
import { RegularTask } from "extended-task-graph/RegularTask";
import { AHoopaStage } from "./AHoopaStage.js";
import { VitisDecorator } from "./decorators/VitisDecorator.js";
import Io from "@specs-feup/lara/api/lara/Io.js";

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
        this.decorate(etg);

        this.log("Running offloading");
        if (this.config.clusterFunction != "<none>") {
            this.offload(etg);
        }
    }

    private decorate(etg: TaskGraph): void {
        const dir = `${this.getOutputDir()}vitis_hls/initial_runs`;
        const cachedRes = `${this.getOutputDir()}/vitis_hls/initial_runs.json`;
        const decorator = new VitisDecorator(this.getTopFunctionName(), this.getOutputDir(), this.getAppName(), dir);

        if (Io.isFile(cachedRes)) {
            decorator.applyCachedDecorations(etg, cachedRes);
        }
        else {
            const aggregate = decorator.decorate(etg);
            const json = JSON.stringify(aggregate, null, 4);

            Io.writeFile(cachedRes, json);
        }
    }

    private offload(etg: TaskGraph): void {
        const task = etg.getTaskByName(this.config.clusterFunction) as RegularTask;
        if (task == null) {
            this.logError(`Task ${this.config.clusterFunction} not found in the ETG!`);
            return;
        }

        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        offloader.offload(task, this.config.backend, true);
    }
}