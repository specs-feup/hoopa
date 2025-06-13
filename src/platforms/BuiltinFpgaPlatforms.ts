import { FpgaTarget, OffloadingBackend } from "../HoopaConfig.js";

export enum BuiltinFpgaTarget {
    ZCU102 = "ZCU102",
    KV260 = "KV260",
}

export const fpgaTargets: Record<string, FpgaTarget> = {
    zcu102: {
        name: "ZCU102",
        backends: [OffloadingBackend.XRT, OffloadingBackend.OPENCL, OffloadingBackend.OMPSS_FPGA, OffloadingBackend.AXI],
        frequency: 200,
        resources: {
            LUTs: 274080,
            FFs: 548160,
            DSPs: 2520,
            BRAM_18Ks: 1824,
            URAMs: 0
        },
        localdeps: {
            vitisVersion: "2024.2",
            sysroot: "/opt/xilinx/xrt/2022.1/sysroots/cortexa53-xilinx-linux",
            rootfs: "/opt/xilinx/xrt/2022.1/rootfs",
            kernel: "/opt/xilinx/xrt/2022.1/kernels"
        }
    },
    kv260: {
        name: "KV260",
        backends: [OffloadingBackend.XRT, OffloadingBackend.OPENCL, OffloadingBackend.OMPSS_FPGA, OffloadingBackend.AXI],
        frequency: 100,
        resources: {
            LUTs: 117120,
            FFs: 234240,
            DSPs: 1248,
            BRAM_18Ks: 288,
            URAMs: 64
        },
        localdeps: {
            vitisVersion: "2024.2",
            sysroot: "/opt/xilinx/xrt/2022.1/sysroots/cortexa53-xilinx-linux",
            rootfs: "/opt/xilinx/xrt/2022.1/rootfs",
            kernel: "/opt/xilinx/xrt/2022.1/kernels"
        }
    }
}

export function getFpgaTarget(name: string): FpgaTarget {
    const target = fpgaTargets[name.toLowerCase()];
    if (!target) {
        throw new Error(`Target ${name} not found`);
    }
    return { ...target };
}