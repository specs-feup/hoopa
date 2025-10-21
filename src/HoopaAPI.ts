import { ExtendedTaskGraphAPI } from "@specs-feup/extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { HoopaAlgorithm, HoopaConfig, HoopaOutputDirectory, HoopaRun, OffloadingBackend, TaskGraphDecorator } from "./HoopaConfig.js";
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
import { AHoopaAlgorithm, HoopaAlgorithmOptions, HoopaAlgorithmReport } from "./algorithms/AHoopaAlgorithm.js";
import { SynthesizabilityDecorator } from "./decorators/SynthesizabilityDecorator.js";
import { HotspotExpansion, HotspotExpansionOptions } from "./algorithms/HotspotExpansion.js";
import { DotConverter } from "@specs-feup/extended-task-graph/DotConverter";
import { ProfilingDecorator } from "./decorators/ProfilingDecorator.js";

export class HoopaAPI extends AHoopaStage {
    private etgApi: ExtendedTaskGraphAPI;
    private transFlowConfig: TransFlowConfig;
    private genFlowConfig: GenFlowConfig;
    private run: HoopaRun;

    constructor(topFunctionName: string, config: HoopaConfig, outputDir = "output", appName = "default_app_name") {
        super("API", topFunctionName, `${outputDir}/${appName}`, appName);
        this.transFlowConfig = config.getTransFlowConfig();
        this.genFlowConfig = config.getGenFlowConfig();
        this.etgApi = new ExtendedTaskGraphAPI(topFunctionName, outputDir, appName);

        const runs = config.generateRuns();
        if (runs.length > 1) {
            this.logWarning(`Multiple runs generated (${runs.length}), only the first one will be run`);
            this.logWarning("Support for multiple runs will be added in future versions");
        }
        this.run = runs[0];
    }

    public runFromStart(skipCodeFlow: boolean = true): void {
        this.logLine();
        this.logStart();
        this.log("Running Hoopa for the current AST");


        const runConfig = this.run;
        this.logLine();
        this.log(`Running Hoopa for run configuration:`);
        this.log(` name:         ${runConfig.variant}`);
        this.log(` decorators:   ${runConfig.decorators.length > 0 ? runConfig.decorators.join(", ") : "none"}`);
        this.log(` algorithm:    ${runConfig.algorithm}`);
        this.log(` alg. options: ${JSON.stringify(runConfig.algorithmOptions)}`);
        this.log(` backends:     ${runConfig.backends.join(", ")}`);
        this.log(` target:       ${runConfig.target.name}`);

        const etg = this.getTaskGraph(skipCodeFlow);
        if (!etg) {
            this.logError("ETG generation failed!");
            return;
        }
        this.log("ETG generated successfully!");

        this.runHoopa(etg, runConfig);
        this.logLine();


        this.log("Finished running Hoopa for all run configurations");
        this.logEnd();
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
        const [cluster, report] = this.runHoopaAlgorithm(etg, config.algorithm, config.algorithmOptions);

        this.saveClusterDot(cluster, etg, report.id);
        this.saveClusterData(report);

        this.log("Starting offloading");
        this.offload(cluster, config.backends, config.variant);
    }

    private saveClusterDot(cluster: Cluster, etg: TaskGraph, name: string): void {
        const filename = `${name}.dot`;
        const dotConverter = new DotConverter();
        const dot = dotConverter.convertCluster(cluster, etg);
        this.saveToFileInSubfolder(dot, filename, HoopaOutputDirectory.CLUSTERS);
        this.log(`Saved cluster dot to ${HoopaOutputDirectory.CLUSTERS}/${filename}`);
    }

    private saveClusterData(cluster: HoopaAlgorithmReport): void {
        const id = cluster.id || "unknown";
        const filename = `${id}_data.json`;
        const json = JSON.stringify(cluster, null, 4);
        this.saveToFileInSubfolder(json, filename, HoopaOutputDirectory.CLUSTERS);
        this.log(`Saved cluster data to ${HoopaOutputDirectory.CLUSTERS}/${filename}`);
    }

    private decorate(etg: TaskGraph, decorators: [TaskGraphDecorator, string][]): void {
        if (decorators.length === 0) {
            this.log("No decorators to apply");
            return;
        }

        for (const [decorator, option] of decorators) {
            switch (decorator) {
                case TaskGraphDecorator.VITIS_HLS:
                    {
                        const vitisDecorator = new VitisDecorator(
                            this.getTopFunctionName(),
                            this.getOutputDir(),
                            this.getAppName(),
                            "vitis_hls/initial_runs");
                        const path = `${HoopaOutputDirectory.DECORATORS}/initial_runs.json`;
                        this.applyDecoration(etg, vitisDecorator, path);
                        break;
                    }
                case TaskGraphDecorator.SYNTHESIZABILITY:
                    {
                        const synthDecorator = new SynthesizabilityDecorator(
                            this.getTopFunctionName(),
                            this.getOutputDir(),
                            this.getAppName(),
                            "vitis_hls/initial_runs");
                        const path = `${HoopaOutputDirectory.DECORATORS}/etg_synthesizability.json`;
                        this.applyDecoration(etg, synthDecorator, path);
                        break;
                    }
                case TaskGraphDecorator.PROFILING:
                    {
                        const profilerName = option || "unknown_profiler";
                        const profilingDecorator = new ProfilingDecorator(
                            this.getTopFunctionName(),
                            this.getOutputDir(),
                            this.getAppName(),
                            profilerName);
                        const profName = `${this.getAppName()}_${profilerName}.json`;
                        const path = `${HoopaOutputDirectory.DECORATORS}/${profName}`;
                        this.applyDecoration(etg, profilingDecorator, path);
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
        this.saveToFileInSubfolder(dot, `taskgraph_${decorator.getLabels().join("_").toLowerCase()}.dot`, etgSubdir);
    }

    private runHoopaAlgorithm(etg: TaskGraph, algorithm: HoopaAlgorithm, options: HoopaAlgorithmOptions): [Cluster, HoopaAlgorithmReport] {
        const topFunctionName = this.getTopFunctionName();
        const outputDir = this.getOutputDir();
        const appName = this.getAppName();
        let alg: AHoopaAlgorithm;

        switch (algorithm) {
            case HoopaAlgorithm.PREDEFINED_TASKS:
                {
                    const config = options as PredefinedTasksOptions;
                    alg = new PredefinedTasks(topFunctionName, outputDir, appName, config);
                    break;
                }
            case HoopaAlgorithm.SINGLE_HOTSPOT:
                {
                    const config = options as SingleHotspotTaskOptions;
                    alg = new SingleHotspotTask(topFunctionName, outputDir, appName, config);
                    break;
                }
            case HoopaAlgorithm.HOTSPOT_EXPANSION:
                {
                    const config = options as HotspotExpansionOptions;
                    alg = new HotspotExpansion(topFunctionName, outputDir, appName, config);
                    break;
                }
            default:
                {
                    this.logError(`Unknown algorithm: ${algorithm}`);
                    return [new Cluster(), { id: "<unknown>" } as HoopaAlgorithmReport];
                }
        }
        return alg.run(etg);
    }

    private offload(cluster: Cluster, backends: OffloadingBackend[], variant: string): void {
        if (backends.length === 0) {
            this.log("No backends to offload to");
            return;
        }

        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        for (const backend of backends) {
            const outDir = `${variant}_${backend.toLowerCase()}`;
            offloader.offload(cluster, backend, outDir, false);
        }
    }
}