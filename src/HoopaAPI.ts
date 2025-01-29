import { ExtendedTaskGraphAPI } from "extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "extended-task-graph/TaskGraph";
import { DefaultGenFlowConfig, DefaultTransFlowConfig, HoopaAlgorithm, HoopaConfig, TaskGraphDecorator } from "./HoopaConfig.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { Cluster } from "extended-task-graph/Cluster";
import { ADecorator } from "./decorators/ADecorator.js";
import { TaskGraphOutput } from "extended-task-graph/OutputDirectories";
import Io from "@specs-feup/lara/api/lara/Io.js";
import { VitisDecorator } from "./decorators/VitisDecorator.js";
import { PredefinedTasks, PredefinedTasksConfig } from "./algorithms/PredefinedTasks.js";
import { SingleHotspotTask, SingleHotspotTaskConfig } from "./algorithms/SingleHotspotTask.js";
import { Offloader } from "./Offloader.js";
import { parse } from "yaml";

export class HoopaAPI extends AHoopaStage {
    private config: HoopaConfig;
    private etgApi: ExtendedTaskGraphAPI;
    private target: Record<string, any>;

    constructor(topFunctionName: string, config: HoopaConfig, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, `${outputDir}/${appName}`, appName);
        this.config = config;
        this.etgApi = new ExtendedTaskGraphAPI(topFunctionName, outputDir, appName);

        const targetYaml = Io.readFile(config.target);
        this.target = parse(targetYaml);
        console.log(this.target);
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
        this.offload(cluster);
    }

    private decorate(etg: TaskGraph, decorators: TaskGraphDecorator[]): void {
        for (const decorator of decorators) {
            switch (decorator) {
                case TaskGraphDecorator.VITIS_HLS:
                    {
                        const vitisDecorator = new VitisDecorator(
                            this.getTopFunctionName(),
                            this.getOutputDir(),
                            this.getAppName(),
                            "vitis_hls/initial_runs");
                        this.applyDecoration(etg, vitisDecorator, "vitis_hls/initial_runs.json");
                        break;
                    }
                default:
                    this.logError(`Unknown decorator: ${decorator}`);
                    break;
            }
        }
    }

    private applyDecoration(etg: TaskGraph, decorator: ADecorator, cachedRes: string): void {
        const fullCachedRes = `${this.getOutputDir()}/${cachedRes}`;
        if (Io.isFile(fullCachedRes)) {
            decorator.applyCachedDecorations(etg, fullCachedRes);
        }
        else {
            const aggregate = decorator.decorate(etg);
            const json = JSON.stringify(aggregate, null, 4);

            Io.writeFile(fullCachedRes, json);
        }

        const dot = decorator.getDotfile(etg);
        const etgSubdir = `${TaskGraphOutput.ETG_PARENT}/decorated`;
        this.saveToFileInSubfolder(dot, `taskgraph_${decorator.getLabel().toLowerCase()}.dot`, etgSubdir);
    }

    private runHoopaAlgorithm(etg: TaskGraph): Cluster {
        const topFunctionName = this.getTopFunctionName();
        const outputDir = this.getOutputDir();
        const appName = this.getAppName();

        switch (this.config.algorithm.name) {
            case HoopaAlgorithm.PREDEFINED_TASKS:
                {
                    const config = this.config.algorithm as PredefinedTasksConfig;
                    const alg = new PredefinedTasks(topFunctionName, outputDir, appName, config);
                    return alg.run(etg);
                }
            case HoopaAlgorithm.SINGLE_HOTSPOT:
                {
                    const config = this.config.algorithm as SingleHotspotTaskConfig;
                    const alg = new SingleHotspotTask(topFunctionName, outputDir, appName, config);
                    return alg.run(etg);
                }
            default:
                this.logError(`Unknown algorithm: ${this.config.algorithm.name}`);
                return new Cluster();
        }
    }

    private offload(cluster: Cluster): void {
        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        for (const backend of this.config.backends) {
            offloader.offload(cluster, backend, this.config.algorithm.name);
        }
    }
}