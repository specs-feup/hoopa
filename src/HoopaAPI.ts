import { ExtendedTaskGraphAPI } from "@specs-feup/extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { HoopaAlgorithm, HoopaConfig, HoopaRun, OffloadingBackend, TaskGraphDecorator } from "./HoopaConfig.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { ADecorator } from "./decorators/ADecorator.js";
import { TaskGraphOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import Io from "@specs-feup/lara/api/lara/Io.js";
import { VitisDecorator } from "./decorators/VitisDecorator.js";
import { PredefinedTasks, PredefinedTasksOptions } from "./algorithms/PredefinedTasks.js";
import { SingleHotspotTask, SingleHotspotTaskOptions } from "./algorithms/SingleHotspotTask.js";
import { Offloader } from "./Offloader.js";
import { TransFlowConfig } from "@specs-feup/extended-task-graph/TransFlowConfig";
import { GenFlowConfig } from "@specs-feup/extended-task-graph/GenFlowConfig";
import { HoopaAlgorithmOptions } from "./algorithms/AHoopaAlgorithm.js";

export class HoopaAPI extends AHoopaStage {
    private etgApi: ExtendedTaskGraphAPI;
    private transFlowConfig: TransFlowConfig;
    private genFlowConfig: GenFlowConfig;
    private runs: HoopaRun[];

    constructor(topFunctionName: string, config: HoopaConfig, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, `${outputDir}/${appName}`, appName);
        this.transFlowConfig = config.getTransFlowConfig();
        this.genFlowConfig = config.getGenFlowConfig();
        this.etgApi = new ExtendedTaskGraphAPI(topFunctionName, outputDir, appName);

        this.runs = config.generateRuns();
    }

    public runFromStart(skipCodeFlow: boolean = true): void {
        this.logLine();
        this.log("Running Hoopa for the current AST");

        this.log(`Generated ${this.runs.length} run configurations from provided HoopaConfig`);

        for (const runConfig of this.runs) {
            this.logLine();
            this.log(`Running Hoopa for run configuration:`);
            this.log(` name:         ${runConfig.variant}`);
            this.log(` decorators:   ${runConfig.decorators.length > 0 ? runConfig.decorators.join(", ") : "none"}`);
            this.log(` algorithm:    ${runConfig.algorithm}`);
            this.log(` alg. options: ${JSON.stringify(runConfig.algorithmOptions)}`);
            this.log(` backends:     ${runConfig.backends}`);
            this.log(` target:       ${runConfig.target.name}`);

            const etg = this.getTaskGraph(skipCodeFlow);
            if (!etg) {
                this.logError("ETG generation failed!");
                return;
            }
            this.log("ETG generated successfully!");

            this.runHoopa(etg, runConfig);
            this.logLine();
        }

        this.log("Finished running Hoopa for all run configurations");
        this.logLine();
    }

    private getTaskGraph(skipCodeFlow: boolean): TaskGraph | null {
        if (!skipCodeFlow) {
            this.log("Starting code transformation flow...");
            this.etgApi.runCodeTransformationFlow(this.transFlowConfig);
            this.log("Code transformation flow finished");
        }

        this.log("Running ETG generation flow...");
        const etg = this.etgApi.runTaskGraphGenerationFlow(this.genFlowConfig);
        return etg;
    }

    private runHoopa(etg: TaskGraph, config: HoopaRun): void {
        this.log("Starting ETG decoration")
        this.decorate(etg, config.decorators);

        this.log("Starting partitioning and optimization algorithm");
        const cluster = this.runHoopaAlgorithm(etg, config.algorithm, config.algorithmOptions);

        this.log("Starting offloading");
        this.offload(cluster, config.backends, config.variant);
    }

    private decorate(etg: TaskGraph, decorators: TaskGraphDecorator[]): void {
        if (decorators.length === 0) {
            this.log("No decorators to apply");
            return;
        }

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

    private runHoopaAlgorithm(etg: TaskGraph, algorithm: HoopaAlgorithm, options: HoopaAlgorithmOptions): Cluster {
        const topFunctionName = this.getTopFunctionName();
        const outputDir = this.getOutputDir();
        const appName = this.getAppName();

        switch (algorithm) {
            case HoopaAlgorithm.PREDEFINED_TASKS:
                {
                    const config = options as PredefinedTasksOptions;
                    const alg = new PredefinedTasks(topFunctionName, outputDir, appName, config);
                    return alg.run(etg);
                }
            case HoopaAlgorithm.SINGLE_HOTSPOT:
                {
                    const config = options as SingleHotspotTaskOptions;
                    const alg = new SingleHotspotTask(topFunctionName, outputDir, appName, config);
                    return alg.run(etg);
                }
            default:
                this.logError(`Unknown algorithm: ${algorithm}`);
                return new Cluster();
        }
    }

    private offload(cluster: Cluster, backends: OffloadingBackend[], variant: string): void {
        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        for (const backend of backends) {
            const outDir = `${variant}_${backend.toLowerCase()}`;
            offloader.offload(cluster, backend, outDir, false);
        }
    }
}