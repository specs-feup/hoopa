import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";
import { CallTreeInliner } from "@specs-feup/clava-code-transforms/CallTreeInliner";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { MallocHoister } from "@specs-feup/clava-code-transforms/MallocHoister";
import { StructFlattener } from "@specs-feup/clava-code-transforms/StructFlattener";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";
import { HlsDeadCodeEliminator } from "./HlsDeadCodeEliminator.js";

export class XrtCBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected applyTransforms(clusterFun: FunctionJp, bridgeFun: FunctionJp, folderName: string): [FunctionJp, FunctionJp] {
        const getClusterFun = () => this.regenFunction(clusterFun.name);
        const getBridgeFun = () => this.regenFunction(bridgeFun.name);

        const steps = [
            { name: "DCE", apply: () => this.applyDeadCodeElimination(getClusterFun(), folderName) },
            { name: "inlining", apply: () => this.applyInlining(getClusterFun(), folderName) },
            { name: "struct flattening", apply: () => this.applyStructFlattening(getClusterFun(), folderName) },
            { name: "malloc hoisting", apply: () => this.applyMallocHoisting(getClusterFun(), folderName) },
        ];

        for (const step of steps) {
            if (!step.apply()) {
                this.log(`Skipping remaining transforms due to ${step.name} failure`);
                return [getClusterFun(), getBridgeFun()];
            }
        }
        return [getClusterFun(), getBridgeFun()];
    }

    private applyPass(name: string, transform: (f: FunctionJp) => void, fun: FunctionJp, folder: string, step: string): boolean {
        this.log(`Applying ${name}`);
        try {
            transform(fun);
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folder}/${step}`);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folder}/${step}`);
            Clava.rebuild();
            return true;
        }
        catch (e) {
            this.logError(`Error during ${name}: ${e}`);
            return false;
        }
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


}