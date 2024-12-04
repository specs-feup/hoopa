export class HoopaConfig {
    backend: OffloadingBackend = OffloadingBackend.XRT;
    clusterFunction: string = "<none>";
}

export enum OffloadingBackend {
    XRT = "XRT",
    OPENCL = "OpenCL"
}