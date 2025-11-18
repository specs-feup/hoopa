import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallTreeInliner } from "@specs-feup/clava-code-transforms/CallTreeInliner";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { MallocHoister } from "@specs-feup/clava-code-transforms/MallocHoister";
import { StructFlattener } from "@specs-feup/clava-code-transforms/StructFlattener";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

export class XrtCBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected applyTransforms(clusterFun: FunctionJp, folderName: string): FunctionJp {
        let fun = this.regenClusterFunction(clusterFun.name);
        const inlined = this.applyInlining(fun, folderName);
        if (!inlined) {
            this.log("Skipping remaining transforms due to inlining failure");
            return this.regenClusterFunction(clusterFun.name);
        }

        // fun = this.regenClusterFunction(clusterFun.name);
        // const hoisted = this.applyMallocHoisting(fun, folderName);
        // if (!hoisted) {
        //     this.log("Skipping remaining transforms due to malloc hoisting failure");
        //     return this.regenClusterFunction(clusterFun.name);
        // }

        // fun = this.regenClusterFunction(clusterFun.name);
        // const flattened = this.applyStructFlattening(fun, folderName);
        // if (!flattened) {
        //     this.log("Skipping remaining transforms due to struct flattening failure");
        //     return this.regenClusterFunction(clusterFun.name);
        // }

        return this.regenClusterFunction(clusterFun.name);
    }

    private applyInlining(clusterFun: FunctionJp, folderName: string): boolean {
        this.log("Applying call tree inlining");
        try {
            const inliner = new CallTreeInliner();
            inliner.inlineCallTree(clusterFun, true);
            Clava.rebuild();

            clusterFun = this.regenClusterFunction(clusterFun.name);
            inliner.revertGlobalsToParams(clusterFun);

            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t1-inline`);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t1-inline`);
            Clava.rebuild();
            return true;
        }
        catch (e) {
            this.logError(`Error during call tree inlining: ${e}`);
            return false;
        }
    }

    private applyMallocHoisting(clusterFun: FunctionJp, folderName: string): boolean {
        this.log("Applying malloc hoisting");
        try {
            const hoister = new MallocHoister();
            hoister.hoistAllMallocs(clusterFun);
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t2-hoisting`);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t2-hoisting`);
            Clava.rebuild();
            return true;
        }
        catch (e) {
            this.logError(`Error during malloc hoisting: ${e}`);
            return false;
        }
    }

    private applyStructFlattening(clusterFun: FunctionJp, folderName: string): boolean {
        this.log("Applying struct flattening");
        try {
            const flat = new StructFlattener(new LightStructFlattener());
            flat.flattenAll(clusterFun);
            this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t3-flattening`);
            this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t3-flattening`);
            Clava.rebuild();
            return true;
        }
        catch (e) {
            this.logError(`Error during struct flattening: ${e}`);
            return false;
        }
    }

    protected buildBody(clusterFun: FunctionJp, bridgeFun: FunctionJp, debug: boolean): Scope {
        this.logWarning("XRT C backend not implemented yet, outputting bridge function as-is");

        const funDecl = clusterFun.getDeclaration(true);
        const funDeclStmt = ClavaJoinPoints.stmtLiteral(`${funDecl};`);
        bridgeFun.insertBefore(funDeclStmt);

        return bridgeFun.body!;
    }

    private regenClusterFunction(name: string): FunctionJp {
        return Query.search(FunctionJp, (f) => (f.name == name && f.isImplementation)).first()!;
    }
}