import { GenFlowConfig } from "@specs-feup/extended-task-graph/GenFlowConfig";
import { SubsetTransform } from "@specs-feup/extended-task-graph/SubsetTransforms";
import { TransFlowConfig } from "@specs-feup/extended-task-graph/TransFlowConfig";
import { HoopaAlgorithmOptions } from "./algorithms/AHoopaAlgorithm.js";
import { BuiltinFpgaTarget, getFpgaTarget } from "./platforms/BuiltinFpgaPlatforms.js";
import { BuiltinGpuTarget, getGpuTarget } from "./platforms/BuiltinGpuPlatforms.js";

export const enum HoopaOutputDirectory {
    DECORATORS = "decorators",
    CLUSTERS = "clusters",
    HLS = "hls_reports",
}

export const enum TaskGraphDecorator {
    VITIS_HLS = "VitisHLS",
    SYNTHESIZABILITY = "Synthesizability",
    PROFILING = "Profiling"
}

export const enum HoopaAlgorithm {
    SINGLE_HOTSPOT = "single_hotspot",
    PREDEFINED_TASKS = "predefined_tasks",
    HOTSPOT_EXPANSION = "hotspot_expansion",
}

export const enum OffloadingBackend {
    AXI = "AXI",
    CPU = "CPU",
    CUDA = "CUDA",
    OMPSS_FPGA = "OmpSs@FPGA",
    OPENCL = "OpenCL",
    XRT = "XRT",
    NONE = "None"
}

export type Target = {
    name: string;
    backends: OffloadingBackend[];
}

export type FpgaTarget = Target & {
    frequency: number;
    resources: {
        LUTs: number;
        FFs: number;
        DSPs: number;
        BRAM_18Ks: number;
        URAMs?: number;         // Optional, some targets may not have URAMs
    };
    localdeps?: {
        vitisVersion?: string;  // specify a Vitis version for maximum compatibility
        sysroot?: string;       // sysroot required to build ARM PetaLinux/Ubuntu targets
        rootfs?: string;        // rootfs required to build SD card image for ARM targets
        kernel?: string;        // kernel required to build SD card image for ARM targets
        platformXsa?: string;   // some targets may already be included by default by Vitis
    }
}

export type GpuTarget = Target & {
    memoryMb: number;
    cudaCores: number;
}

export const DefaultTransFlowConfig = new TransFlowConfig();
DefaultTransFlowConfig.transformRecipe = [
    SubsetTransform.ArrayFlattener,
    SubsetTransform.ConstantFoldingPropagation
];

export const DefaultGenFlowConfig = new GenFlowConfig();
DefaultGenFlowConfig.gatherMetrics = false;

export type HoopaRun = {
    variant: string;
    decorators: [TaskGraphDecorator, string][];
    algorithm: HoopaAlgorithm;
    algorithmOptions: HoopaAlgorithmOptions;
    backends: OffloadingBackend[];
    target: Target;
}

export class HoopaConfig {
    private transFlowConfig: TransFlowConfig;
    private genFlowConfig: GenFlowConfig;
    private decorators: [TaskGraphDecorator, string][];
    private backends: OffloadingBackend[];
    private algorithms: HoopaAlgorithm[];
    private algorithmOptions: HoopaAlgorithmOptions[];
    private targets: Target[];

    constructor() {
        this.transFlowConfig = DefaultTransFlowConfig;
        this.genFlowConfig = DefaultGenFlowConfig;
        this.decorators = [];
        this.backends = [];
        this.algorithms = [];
        this.algorithmOptions = [];
        this.targets = [];
    }

    public setTransFlowConfig(config: TransFlowConfig): HoopaConfig {
        this.transFlowConfig = config;
        return this;
    }

    public setGenFlowConfig(config: GenFlowConfig): HoopaConfig {
        this.genFlowConfig = config;
        return this;
    }

    public addDecorator(decorator: TaskGraphDecorator, option: string = "<none>"): HoopaConfig {
        this.decorators.push([decorator, option]);
        return this;
    }

    public addBackend(backend: OffloadingBackend): HoopaConfig {
        this.backends.push(backend);
        return this;
    }

    public addAlgorithm(algorithm: HoopaAlgorithm, options: HoopaAlgorithmOptions): HoopaConfig {
        this.algorithms.push(algorithm);
        this.algorithmOptions.push(options);
        return this;
    }

    public addBuiltinFpgaTarget(targetName: BuiltinFpgaTarget): HoopaConfig {
        const target = getFpgaTarget(targetName)
        this.targets.push(target);
        return this;
    }

    public addBuiltinGpuTarget(targetName: BuiltinGpuTarget): HoopaConfig {
        const target = getGpuTarget(targetName)
        this.targets.push(target);
        return this;
    }

    public addCustomTarget(target: Target): HoopaConfig {
        this.targets.push(target);
        return this;
    }

    public addTargetByName(name: string): HoopaConfig {
        const target = getFpgaTarget(name) || getGpuTarget(name);
        this.targets.push(target);
        return this;
    }

    public getTransFlowConfig(): TransFlowConfig {
        return this.transFlowConfig;
    }

    public getGenFlowConfig(): GenFlowConfig {
        return this.genFlowConfig;
    }

    public getDecorators(): [TaskGraphDecorator, string][] {
        return this.decorators;
    }

    public getBackends(): OffloadingBackend[] {
        return this.backends;
    }

    public getAlgorithms(): HoopaAlgorithm[] {
        return this.algorithms;
    }

    public getAlgorithmOptions(): HoopaAlgorithmOptions[] {
        return this.algorithmOptions;
    }

    public getTargets(): Target[] {
        return this.targets;
    }

    public getTargetsByName(name: string): Target | undefined {
        return this.targets.find(target => target.name === name);
    }

    public getTargetsByBackend(backend: OffloadingBackend): Target[] {
        return this.targets.filter(target => target.backends.includes(backend));
    }

    public generateRuns(): HoopaRun[] {
        const runs: HoopaRun[] = [];
        for (let i = 0; i < this.algorithms.length; i++) {
            const algorithm = this.algorithms[i];
            const algorithmOptions = this.algorithmOptions[i];

            for (const target of this.targets) {
                const validDecorators = [];
                for (const decorator of this.decorators) {
                    // validate decorator for alg and platform
                    validDecorators.push(decorator);
                }

                const validBackends = [];
                for (const backend of this.backends) {
                    if (target.backends.includes(backend)) {
                        validBackends.push(backend);
                    }
                    else if (backend == OffloadingBackend.CPU || backend == OffloadingBackend.NONE) {
                        // CPU is always valid
                        validBackends.push(backend);
                    }
                }
                const run: HoopaRun = {
                    variant: `alg${i}_${algorithm}_${target.name.toLowerCase()}`,
                    decorators: validDecorators,
                    algorithm: algorithm,
                    algorithmOptions: algorithmOptions,
                    backends: validBackends,
                    target: target
                }
                runs.push(run);
            }

        }
        return runs;
    }
}