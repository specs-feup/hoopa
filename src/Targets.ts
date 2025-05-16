import { FpgaTarget, GpuTarget, OffloadingBackend } from "./HoopaConfig.js";

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