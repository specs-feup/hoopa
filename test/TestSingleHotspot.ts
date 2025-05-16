import { SingleHotspotTaskOptions } from "../src/algorithms/SingleHotspotTask.js";
import { HoopaAPI } from "../src/HoopaAPI.js";
import { BuiltinTarget, HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";

const config = new HoopaConfig()
    .addDecorator(TaskGraphDecorator.VITIS_HLS)
    .addBackend(OffloadingBackend.XRT)
    .addAlgorithm(HoopaAlgorithm.SINGLE_HOTSPOT, {} as SingleHotspotTaskOptions)
    .addBuiltinTarget(BuiltinTarget.ZCU102);

const hoopa = new HoopaAPI("edge_detect", config, "outputs/local", "edgedetect");
hoopa.runFromStart(false);