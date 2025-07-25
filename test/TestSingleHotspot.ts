import { SingleHotspotTaskOptions } from "../src/algorithms/SingleHotspotTask.js";
import { HoopaAPI } from "../src/HoopaAPI.js";
import { HoopaAlgorithm, HoopaConfig, OffloadingBackend, TaskGraphDecorator } from "../src/HoopaConfig.js";
import { BuiltinFpgaTarget } from "../src/platforms/BuiltinFpgaPlatforms.js";

const config = new HoopaConfig()
    .addDecorator(TaskGraphDecorator.VITIS_HLS)
    .addDecorator(TaskGraphDecorator.SYNTHESIZABILITY)
    .addBackend(OffloadingBackend.XRT)
    .addAlgorithm(HoopaAlgorithm.SINGLE_HOTSPOT, {} as SingleHotspotTaskOptions)
    .addBuiltinFpgaTarget(BuiltinFpgaTarget.ZCU102);

const hoopa = new HoopaAPI("edge_detect", config, "outputs/local", "edgedetect");
hoopa.runFromStart(false);