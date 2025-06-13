import { GpuTarget, OffloadingBackend } from "../HoopaConfig.js";

export enum BuiltinGpuTarget {
    A100 = "A100",
    RTX3060M = "RTX3060M",
}

export const gpuTargets: Record<string, GpuTarget> = {
    a100: {
        name: "A100",
        backends: [OffloadingBackend.CUDA],
        memoryMb: 40000,
        cudaCores: 6912
    },
    rtx3060m: {
        name: "RTX 3060 Mobile",
        backends: [OffloadingBackend.CUDA],
        memoryMb: 6144,
        cudaCores: 3840
    }
}

export function getGpuTarget(name: string): GpuTarget {
    const target = gpuTargets[name.toLowerCase()];
    if (!target) {
        throw new Error(`Target ${name} not found`);
    }
    return { ...target };
}