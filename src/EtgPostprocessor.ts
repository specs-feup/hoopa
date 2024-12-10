import { TaskGraph } from "extended-task-graph/TaskGraph";
import { AHoopaStage } from "./AHoopaStage.js";
import { EtgDecorator } from "./decorators/EtgDecorator.js";
import { VitisDecorator } from "./decorators/VitisDecorator.js";
import Io from "@specs-feup/lara/api/lara/Io.js";
import { TaskGraphOutput } from "extended-task-graph/OutputDirectories";

export class EtgPostprocessor extends AHoopaStage {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super("ETG-Postprocessor", topFunctionName, outputDir, appName);
    }

    public applyVitisDecoration(etg: TaskGraph): void {
        const vitisDecorator = new VitisDecorator(this.getTopFunctionName(),
            this.getOutputDir(),
            this.getAppName(),
            "vitis_hls/initial_runs");
        this.applyDecoration(etg, vitisDecorator, "vitis_hls/initial_runs.json");
    }

    private applyDecoration(etg: TaskGraph, decorator: EtgDecorator, cachedRes: string): void {
        const fullCachedRes = `${this.getOutputDir()}/${cachedRes}`;
        if (Io.isFile(fullCachedRes)) {
            decorator.applyCachedDecorations(etg, fullCachedRes);
        }
        else {
            const aggregate = decorator.decorate(etg);
            const json = JSON.stringify(aggregate, null, 4);

            Io.writeFile(fullCachedRes, json);
        }

        const dot = decorator.getDotfile(etg);
        const etgSubdir = `${TaskGraphOutput.ETG_PARENT}/decorated`;
        this.saveToFileInSubfolder(dot, `taskgraph_${decorator.getLabel().toLowerCase()}.dot`, etgSubdir);
    }
}