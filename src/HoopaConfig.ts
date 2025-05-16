import { GenFlowConfig } from "@specs-feup/extended-task-graph/GenFlowConfig";
import { SubsetTransform } from "@specs-feup/extended-task-graph/SubsetTransforms";
import { TransFlowConfig } from "@specs-feup/extended-task-graph/TransFlowConfig";
import { HoopaAlgorithmOptions } from "./algorithms/AHoopaAlgorithm.js";


export enum TaskGraphDecorator {
    VITIS_HLS = "VitisHLS"
}

export enum HoopaAlgorithm {
    SINGLE_HOTSPOT = "single_hotspot",
    PREDEFINED_TASKS = " predefined_tasks"
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

export enum BuiltinTarget {
    ZCU102 = "ZCU102",
    KV260 = "KV260",
    A100 = "A100"
}

export const fpgaTargets: Record<string, FpgaTarget> = {
    zcu102: {
        name: "ZCU102",
        backends: [OffloadingBackend.XRT, OffloadingBackend.OPENCL, OffloadingBackend.OMPSS_FPGA, OffloadingBackend.AXI],
        frequency: 200,
        resources: {
            LUTs: 50000,
            FFs: 100000,
            DSPs: 2000,
            BRAMs: 100
        },
        localdeps: {
            sysroot: "/opt/xilinx/xrt/2022.1/sysroots/cortexa53-xilinx-linux",
            rootfs: "/opt/xilinx/xrt/2022.1/rootfs",
            kernel: "/opt/xilinx/xrt/2022.1/kernels"
        }
    },
    kv260: {
        name: "KV260",
        backends: [OffloadingBackend.XRT, OffloadingBackend.OPENCL, OffloadingBackend.OMPSS_FPGA, OffloadingBackend.AXI],
        frequency: 200,
        resources: {
            LUTs: 50000,
            FFs: 100000,
            DSPs: 2000,
            BRAMs: 100
        },
        localdeps: {
            sysroot: "/opt/xilinx/xrt/2022.1/sysroots/cortexa53-xilinx-linux",
            rootfs: "/opt/xilinx/xrt/2022.1/rootfs",
            kernel: "/opt/xilinx/xrt/2022.1/kernels"
        }
    }
}

export const gpuTargets: Record<string, GpuTarget> = {
    a100: {
        name: "A100",
        backends: [OffloadingBackend.CUDA],
        memoryGb: 40
    }
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
    decorators: TaskGraphDecorator[];
    algorithm: HoopaAlgorithm;
    algorithmOptions: HoopaAlgorithmOptions;
    backends: OffloadingBackend[];
    target: Target;
}

export class HoopaConfig {
    private transFlowConfig: TransFlowConfig;
    private genFlowConfig: GenFlowConfig;
    private decorators: TaskGraphDecorator[];
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

    public addDecorator(decorator: TaskGraphDecorator): HoopaConfig {
        this.decorators.push(decorator);
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

    public addBuiltinTarget(targetName: BuiltinTarget): HoopaConfig {
        const target = getFpgaTarget(targetName) || getGpuTarget(targetName);
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

    public getDecorators(): TaskGraphDecorator[] {
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