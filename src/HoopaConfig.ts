import { GenFlowConfig } from "@specs-feup/extended-task-graph/GenFlowConfig";
import { SubsetTransform } from "@specs-feup/extended-task-graph/SubsetTransforms";
import { TransFlowConfig } from "@specs-feup/extended-task-graph/TransFlowConfig";
import { HoopaAlgorithmOptions } from "./algorithms/AHoopaAlgorithm.js";
import { fpgaTargets, gpuTargets } from "./Targets.js";


export enum TaskGraphDecorator {
    VITIS_HLS = "VitisHLS"
}

export enum HoopaAlgorithm {
    SINGLE_HOTSPOT = "alg_single_hotspot",
    PREDEFINED_TASKS = "alg_predefined_tasks"
}

export enum OffloadingBackend {
    AXI = "AXI",
    CUDA = "CUDA",
    OMPSS_FPGA = "OmpSs@FPGA",
    OPENCL = "OpenCL",
    XRT = "XRT"
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
        BRAMs: number;
    };
    localdeps?: {
        sysroot: string;
        rootfs: string;
        kernel: string;
    }
}

export type GpuTarget = Target & {
    memoryGb: number;
}

export function getFpgaTarget(name: string): FpgaTarget {
    const target = fpgaTargets[name.toLowerCase()];
    if (!target) {
        throw new Error(`Target ${name} not found`);
    }
    return { ...target };
}

export function getGpuTarget(name: string): GpuTarget {
    const target = gpuTargets[name.toLowerCase()];
    if (!target) {
        throw new Error(`Target ${name} not found`);
    }
    return { ...target };
}

export const DefaultTransFlowConfig = new TransFlowConfig();
DefaultTransFlowConfig.transformRecipe = [
    SubsetTransform.ArrayFlattener,
    SubsetTransform.ConstantFoldingPropagation
];

export const DefaultGenFlowConfig = new GenFlowConfig();
DefaultGenFlowConfig.gatherMetrics = false;

export type HoopaRun = {
    decorator: TaskGraphDecorator;
    algorithm: HoopaAlgorithm;
    algorithmOptions: HoopaAlgorithmOptions;
    backend: OffloadingBackend;
    target: Target;
}

export class HoopaConfig {
    private transFlowConfig: TransFlowConfig;
    private genFlowConfig: GenFlowConfig;
    private decorators: TaskGraphDecorator[];
    private backends: OffloadingBackend[];
    private algorithms: Map<HoopaAlgorithm, HoopaAlgorithmOptions[]>;
    private targets: Target[];

    constructor() {
        this.transFlowConfig = DefaultTransFlowConfig;
        this.genFlowConfig = DefaultGenFlowConfig;
        this.decorators = [];
        this.backends = [];
        this.algorithms = new Map();
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

    public addDecorator(decorator: TaskGraphDecorator): HoopaConfig {
        this.decorators.push(decorator);
        return this;
    }

    public addBackend(backend: OffloadingBackend): HoopaConfig {
        this.backends.push(backend);
        return this;
    }

    public addAlgorithm(algorithm: HoopaAlgorithm, options: HoopaAlgorithmOptions): HoopaConfig {
        if (!this.algorithms.has(algorithm)) {
            this.algorithms.set(algorithm, []);
        }
        this.algorithms.get(algorithm)?.push(options);
        return this;
    }

    public addTarget(target: Target): HoopaConfig {
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

    public getDecorators(): TaskGraphDecorator[] {
        return this.decorators;
    }

    public getBackends(): OffloadingBackend[] {
        return this.backends;
    }

    public getAlgorithms(): Map<HoopaAlgorithm, HoopaAlgorithmOptions[]> {
        return this.algorithms;
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
        for (const decorator of this.decorators) {
            for (const backend of this.backends) {
                for (const [algorithm, options] of this.algorithms.entries()) {
                    for (const algOptions of options) {
                        for (const target of this.targets) {
                            runs.push({
                                decorator,
                                algorithm,
                                algorithmOptions: algOptions,
                                backend,
                                target
                            });
                        }
                    }
                }
            }
        }
        return runs;
    }
}