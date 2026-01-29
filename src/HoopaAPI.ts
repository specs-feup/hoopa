import { ExtendedTaskGraphAPI } from "@specs-feup/extended-task-graph/ExtendedTaskGraphAPI";
import { TaskGraph } from "@specs-feup/extended-task-graph/TaskGraph";
import { HoopaAlgorithm, HoopaConfig, HoopaOutputDirectory, HoopaRun, OffloadingBackend, TaskGraphDecorator } from "./HoopaConfig.js";
import { AHoopaStage } from "./AHoopaStage.js";
import { Cluster } from "@specs-feup/extended-task-graph/Cluster";
import { ADecorator } from "./decorators/ADecorator.js";
import { SourceCodeOutput, TaskGraphOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
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
import { ClusterOutliner } from "@specs-feup/extended-task-graph/ClusterOutliner";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Call, FileJp, FunctionJp, Loop } from "@specs-feup/clava/api/Joinpoints.js";
import { BackendOptions } from "./backends/ABackend.js";

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

    public runFromStart(skipCodeFlow: boolean = true): boolean {
        this.logLine();
        this.logStart();
        this.log("Running Hoopa for the current AST");

        const runConfig = this.run;
        this.logLine();
        this.log(`Current configuration is: `);
        this.log(` name: ${runConfig.variant}`);
        this.log(` decorators: ${runConfig.decorators.length > 0 ? runConfig.decorators.join(", ") : "none"}`);
        this.log(` algorithm: ${runConfig.algorithm}`);
        this.log(` alg.options: ${JSON.stringify(runConfig.algorithmOptions)}`);
        this.log(` backends: ${runConfig.backends.join(", ")}`);
        this.log(` target: ${runConfig.target.name}`);

        const etg = this.getTaskGraph(skipCodeFlow);
        if (!etg) {
            this.logError("ETG generation failed!");
            return false;
        }
        this.log("ETG generated successfully!");

        const ok = this.runHoopa(etg, runConfig);
        this.logLine();

        if (!ok) {
            this.logError("Hoopa run failed!");
        }
        else {
            this.log("Finished running Hoopa");
        }
        this.logEnd();
        this.logLine();
        return ok;
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

    private runHoopa(etg: TaskGraph, config: HoopaRun): boolean {
        this.log("Starting ETG decoration")
        this.decorate(etg, config.decorators);

        this.log("Starting partitioning and optimization algorithm");
        const [cluster, report] = this.runHoopaAlgorithm(etg, config.algorithm, config.algorithmOptions);

        this.saveClusterDot(cluster, etg, report.id);
        this.saveClusterData(report);

        this.log("Starting hw/sw splitting");
        const [bridgeFun, hwFun] = this.splitHardwareSoftware(cluster, report.id);
        if (bridgeFun === null || hwFun === null) {
            this.logError("Hardware/software splitting failed, cannot proceed with offloading");
            return false;
        }

        this.log("Starting offloading backends");
        return this.createBackends(config.backends, bridgeFun, hwFun, report.id);
    }

    private saveClusterDot(cluster: Cluster, etg: TaskGraph, name: string): void {
        const filename = `${name}.dot`;
        const dotConverter = new DotConverter();
        const dot = dotConverter.convertCluster(cluster, etg);
        this.saveToFileInSubfolder(dot, filename, HoopaOutputDirectory.CLUSTERS);
        this.log(`Saved cluster dot to ${HoopaOutputDirectory.CLUSTERS} / ${filename}`);
    }

    private saveClusterData(cluster: HoopaAlgorithmReport): void {
        const id = cluster.id || "unknown";
        const filename = `${id}_data.json`;
        const json = JSON.stringify(cluster, null, 4);
        this.saveToFileInSubfolder(json, filename, HoopaOutputDirectory.CLUSTERS);
        this.log(`Saved cluster data to ${HoopaOutputDirectory.CLUSTERS} / ${filename}`);
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
                        const path = `${HoopaOutputDirectory.DECORATORS}/etg_hls_estimates.json`;
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

                        const updated = profilingDecorator.fillInBlanks(etg, profilerName);
                        if (updated) {
                            this.log("Some tasks were missing profiling data, using estimated values where necessary");
                        }
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

    public splitHardwareSoftware(cluster: Cluster, alg: string): [FunctionJp, FunctionJp] | [null, null] {
        const outliner = new ClusterOutliner(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        const outlineRes = outliner.outlineCluster(cluster);
        if (outlineRes === null) {
            this.logError("Cluster outlining failed, cannot proceed with offloading");
            const outDir = `${alg}_failed_outlining`;
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${outDir}`);
            this.log(`Generated invalid code at ${SourceCodeOutput.SRC_PARENT} ${outDir}`);
            return [null, null];
        }
        const [_, bridgeFun, clusterFun] = outlineRes;
        return [bridgeFun, clusterFun];
    }

    public createBackends(backends: OffloadingBackend[], bridgeFun: FunctionJp, clusterFun: FunctionJp, folderName: string): boolean {
        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());

        let success = true;
        for (const backend of backends) {
            const fullFolderName = `${folderName}_${backend.toLowerCase()}`;

            const ok = offloader.apply(clusterFun, bridgeFun, backend, fullFolderName, false);
            if (!ok) {
                this.logError(`Offloading with backend ${backend} failed`);
                success = false;
            }
        }
        return success;
    }

    public resumeFromBackendCheckpoint(parentFolder: string, clusterFileName: string, bridgeFileName: string, backend: OffloadingBackend, recipe: string[]): boolean {
        const clusterFile = Query.search(FileJp, { name: clusterFileName }).first() as FileJp;
        const bridgeFile = Query.search(FileJp, { name: bridgeFileName }).first() as FileJp;
        if (!clusterFile || !bridgeFile) {
            this.logError(`Could not find cluster file ${clusterFileName} or bridge file ${bridgeFileName}`);
            return false;
        }

        const bridgeFun = Query.searchFrom(bridgeFile, FunctionJp).first() as FunctionJp;
        if (!bridgeFun) {
            this.logError(`Could not find bridge function in file ${bridgeFileName}`);
            return false;
        }

        const clusterCall = Query.searchFrom(bridgeFun, Call).first() as Call;
        if (!clusterCall) {
            this.logError(`Could not find cluster function call in bridge function ${bridgeFun.name}`);
            return false;
        }

        const clusterFunName = clusterCall.name;
        const clusterFun = Query.searchFrom(clusterFile, FunctionJp, { name: clusterFunName }).first() as FunctionJp;
        if (!clusterFun) {
            this.logError(`Could not find cluster function ${clusterFunName} in file ${clusterFileName}`);
            return false;
        }
        const options: BackendOptions = { recipe: recipe, skipETG: true, skipFramaC: true };

        const offloader = new Offloader(this.getTopFunctionName(), this.getOutputDir(), this.getAppName());
        const ok = offloader.apply(clusterFun, bridgeFun, backend, parentFolder, false, options);
        if (!ok) {
            this.logError(`Offloading with backend ${backend} failed`);
            return false;
        }
        return true;
    }
}