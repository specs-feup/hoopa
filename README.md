# hoopa

Hoopa (**Ho**listic **o**ptimization and **p**artitioning **a**lgorithms) is an extension to the [Clava C/C++ to C/C++ source-to-source compiler](https://github.com/specs-feup/clava) that takes in any C/C++ application and finds code regions suitable for FPGA offloading. Besides providing basic partitioning algorithms, Hoopa also proposes and implements a novel algorithm that selects a region by considering both the partitioning decisions (e.g., CPU-FPGA communication costs, FPGA resources) and the optimizations performed over the FPGA code (e.g., streaming, pipelining).

## How to install

This package is [available on NPM](https://www.npmjs.com/package/@specs-feup/hoopa). Assuming you already have a [Clava-based NPM project](https://github.com/specs-feup/clava-project-template) setup, you can install the latest stable release with:

```bash
npm install @specs-feup/hoopa@latest
```

If you want to use unstable and experimental features, use the `staging` or `nightly` tags instead, as they are both built using the most recent commit in the repository. Nightly builds are built automatically every day, while staging builds are built on-demand:

```bash
npm install @specs-feup/hoopa@nightly
```

## Partitoning algorithms

Hoopa is still in very early development, and so far we only provide two basic policies:

### Offloading user-defined tasks

```TypeScript
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend } from "@specs-feup/hoopa/HoopaAlgorithm";
import { HoopaAPI } from "@specs-feup/hoopa/HoopaAPI";
import { PredefinedTasksConfig } from "@specs-feup/hoopa/PredefinedTasksConfig";

const config: HoopaConfig = {
    decorators: [],
    backends: [OffloadingBackend.XRT],
    algorithm: {
        name: HoopaAlgorithm.PREDEFINED_TASKS,
        taskNames: ["convolve2d_rep2", "combthreshold"]
    } as PredefinedTasksConfig,
    target: "targets/ZCU102.yaml"
};

const hoopa = new HoopaAPI("edge_detect", config, "outputs/s40", "edgedetect");
hoopa.runFromStart(false);
```

### Offloading the task with the highest latency

```TypeScript
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "@specs-feup/hoopa/HoopaAlgorithm";
import { HoopaAPI } from "@specs-feup/hoopa/HoopaAPI";

const config: HoopaConfig = {
    decorators: [TaskGraphDecorator.VITIS_HLS],
    backends: [OffloadingBackend.XRT],
    algorithm: {
        name: HoopaAlgorithm.SINGLE_HOTSPOT
    },
    target: "targets/ZCU102.yaml"
};

const hoopa = new HoopaAPI("edge_detect", config, "outputs/s41", "edgedetect");
hoopa.runFromStart(false);
```
