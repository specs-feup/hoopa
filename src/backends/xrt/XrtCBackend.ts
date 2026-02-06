import { FileJp, FunctionJp, Scope, Statement, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";
import { CallTreeInliner } from "@specs-feup/clava-code-transforms/CallTreeInliner";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { MallocHoister } from "@specs-feup/clava-code-transforms/MallocHoister";
import { StructFlattener } from "@specs-feup/clava-code-transforms/StructFlattener";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";
import { HlsDeadCodeEliminator } from "./HlsDeadCodeEliminator.js";
import { InterfaceBuilder } from "./InterfaceBuilder.js";
import { join } from "path";
import { MemoryOptimizer } from "./MemoryOptimizer.js";
import Io from "@specs-feup/lara/api/lara/Io.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { VitisHls } from "@specs-feup/clava-vitis-integration/VitisHls";
import { AmdPlatform, ClockUnit, FlowTarget, OutputFormat, UncertaintyUnit, VitisHlsConfig } from "@specs-feup/clava-vitis-integration/VitisHlsConfig";

export class XrtCBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected applyTransforms(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string, recipe?: string[]): [FunctionJp, FunctionJp] {
        const getClusterFun = () => this.regenFunction(clusterFun.name);
        const getBridgeFun = () => this.regenFunction(bridgeFun.name);

        const steps: Map<string, any> = new Map();
        steps.set("t0-interface-building", { name: "interface building", apply: () => this.applyInterfaceBuilding(getClusterFun(), getBridgeFun(), folderName) });
        steps.set("t1-dead-code-elimination", { name: "DCE", apply: () => this.applyDeadCodeElimination(getClusterFun(), folderName) });
        steps.set("t2-inline", { name: "inlining", apply: () => this.applyInlining(getClusterFun(), folderName) });
        steps.set("t3-flattening", { name: "struct flattening", apply: () => this.applyStructFlattening(getClusterFun(), folderName) });
        steps.set("t4-hoisting", { name: "malloc hoisting", apply: () => this.applyMallocHoisting(getClusterFun(), folderName) });
        steps.set("t5-optimization", { name: "optimization", apply: () => this.applyOptimizations(getClusterFun(), getBridgeFun(), folderName) });

        recipe = recipe ?? [
            "t0-interface-building",
            "t1-dead-code-elimination",
            "t2-inline",
            "t3-flattening",
            "t4-hoisting",
            "t5-optimization"
        ]

        for (const transform of recipe) {
            const step = steps.get(transform);
            if (!step.apply()) {
                this.log(`Skipping remaining transforms due to ${step.name} failure`);
                return [getClusterFun(), getBridgeFun()];
            }
        }
        return [getClusterFun(), getBridgeFun()];
    }

    protected buildCommunication(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string, debug: boolean): [FunctionJp, FunctionJp] {
        this.fixLoopTripcountPragmas(clusterFun);
        this.generateHlsConfigFile(clusterFun, folderName);
        return [clusterFun, bridgeFun];
    }

    private generateHlsConfigFile(clusterFun: FunctionJp, folderName: string): void {
        this.log(`Generating HLS config file`);

        const cfg = new VitisHlsConfig(clusterFun.name);
        const allHeaders = Query.search(FileJp, (f) => f.isHeader && !f.isInSystemHeader).get();
        cfg.addSources(allHeaders);
        cfg.addSource(clusterFun.getAncestor("file") as FileJp);
        cfg.setClock({ value: 150, unit: ClockUnit.MEGAHERTZ });
        cfg.setUncertainty({ value: 2, unit: UncertaintyUnit.NANOSECOND });
        cfg.setOutputFormat(OutputFormat.VITIS_XO);
        cfg.setFlowTarget(FlowTarget.VITIS);
        cfg.setPlatform(AmdPlatform.ZCU102);

        const contents = cfg.generateConfigFile();
        const name = "hls_config.cfg";
        const path = join(this.getOutputDir(), SourceCodeOutput.SRC_PARENT, folderName, "final");
        Io.writeFile(join(path, name), contents);

        this.log(`HLS config file generated at ${path}/${name}`);
    }

    private fixLoopTripcountPragmas(clusterFun: FunctionJp): void {
        this.log(`Fixing loop tripcount pragmas`);

        const pragmas = Query.searchFrom(clusterFun, WrapperStmt, (w) => w.code.toLowerCase().startsWith("#pragma hls loop_tripcount")).get();
        for (const pragma of pragmas) {
            const max = Number.parseInt(/\bmax\s*=\s*(\d+)/.exec(pragma.code)?.[1] ?? "-1");
            const min = Number.parseInt(/\bmin\s*=\s*(\d+)/.exec(pragma.code)?.[1] ?? "-1");
            const avg = Number.parseInt(/\bavg\s*=\s*(\d+)/.exec(pragma.code)?.[1] ?? "-1");
            if (max == -1) {
                this.logWarning(`Loop with pragma '${pragma.code}' does not have a max trip count`);
                continue;
            }
            if (min == -1 && avg == -1) {
                continue;
            }
            let newPragma = pragma.code;
            if (min != -1 && avg == -1) {
                if (min > max) {
                    newPragma = `#pragma HLS loop_tripcount max=${min} min=${max}`;
                }
                if (min == max) {
                    newPragma = `#pragma HLS loop_tripcount max=${min}`;
                }
            }
            else if (min >= max || avg >= max || avg >= min) {
                const newMax = Math.max(max, min, avg);
                const newMin = avg != -1 ? Math.min(max, min, avg) : Math.min(max, min);
                if (newMax == newMin) {
                    newPragma = `#pragma HLS loop_tripcount max=${newMax}`;
                }
                if (newMax != avg && newMin != avg) {
                    newPragma = `#pragma HLS loop_tripcount max=${newMax} min=${newMin} avg=${avg}`;
                }
                else {
                    newPragma = `#pragma HLS loop_tripcount max=${newMax} min=${newMin}`;
                }
            }
            if (newPragma != pragma.code) {
                this.log(`  Updating '${pragma.code.split("count")[1].trim()}' -> '${newPragma.split("count")[1].trim()}'`);
                pragma.replaceWith(ClavaJoinPoints.stmtLiteral(newPragma));
            }
        }
        this.log(`Fixed ${pragmas.length} loop tripcount pragmas`);
    }

    private applyPass(name: string, transform: (f: FunctionJp) => void, fun: FunctionJp, folder: string, step: string): boolean {
        this.log(`Applying ${name}`);
        try {
            transform(fun);
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folder}/${step}`, false);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folder}/${step}`);
            Clava.rebuild();
            return true;
        }
        catch (e) {
            this.logError(`Error during ${name}: ${e}`);
            return false;
        }
    }

    private applyInterfaceBuilding(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("interface building", (fun) => {
            const interfaceBuilder = new InterfaceBuilder();
            const inoutsPath = join(this.getOutputDir(), SourceCodeOutput.SRC_PARENT, folderName, "interface-instr");
            const interfaceDesc = interfaceBuilder.readInterface(inoutsPath);
            interfaceBuilder.buildInterface(interfaceDesc, clusterFun, bridgeFun);
        }, clusterFun, folderName, "t0-interface-building");
    }

    private applyDeadCodeElimination(clusterFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("dead code elimination", (fun) => {
            new HlsDeadCodeEliminator().removeAll(fun);
        }, clusterFun, folderName, "t1-dead-code-elimination");
    }

    private applyInlining(clusterFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("call tree inlining", (fun) => {
            const inliner = new CallTreeInliner();
            inliner.inlineCallTree(fun, true);
            Clava.rebuild();

            const newFun = this.regenFunction(fun.name);
            inliner.revertGlobalsToParams(newFun);
        }, clusterFun, folderName, "t2-inline");
    }

    private applyStructFlattening(clusterFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("struct flattening", (fun) => {
            new StructFlattener(new LightStructFlattener()).flattenAll(fun);
        }, clusterFun, folderName, "t3-flattening");
    }

    private applyMallocHoisting(clusterFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("malloc hoisting", (fun) => {
            new MallocHoister().hoistAllMallocs(fun);
        }, clusterFun, folderName, "t4-hoisting");
    }

    private applyOptimizations(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string): boolean {
        return this.applyPass("optimizations", (fun) => {
            const res = new MemoryOptimizer().apply(clusterFun, bridgeFun);
            console.log(res);

            const json = JSON.stringify(res, null, 4);
            const filename = `${this.getAppName()}_memory-optimization-report.json`;
            const path = join(".", this.getOutputDir(), SourceCodeOutput.SRC_PARENT, folderName, "t5-optimization", filename);
            Io.writeFile(path, json);
            this.log(`Memory optimization report saved to ${path}`);
        }, clusterFun, folderName, "t5-optimization");
    }
}