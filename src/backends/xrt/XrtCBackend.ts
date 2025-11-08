import { FunctionJp, Scope } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallTreeInliner } from "@specs-feup/clava-code-transforms/CallTreeInliner";
import { SourceCodeOutput } from "@specs-feup/extended-task-graph/OutputDirectories";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { MallocHoister } from "@specs-feup/clava-code-transforms/MallocHoister";
import { StructFlattener } from "@specs-feup/clava-code-transforms/StructFlattener";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";

export class XrtCBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected applyTransforms(clusterFun: FunctionJp, folderName: string): FunctionJp {
        const getFunction = () => Query.search(FunctionJp, (f) => (f.name == clusterFun.name && f.isImplementation)).first()!;

        let fun = getFunction();
        const inliner = new CallTreeInliner();
        this.log("Applying call tree inlining");
        inliner.inlineCallTree(fun, true);
        this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t1-inline`);
        this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t1-inline`);
        Clava.rebuild();


        fun = getFunction();
        const hoister = new MallocHoister();
        this.log("Applying malloc hoisting");
        hoister.hoistAllMallocs(fun);
        this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t2-hoisting`);
        this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t2-hoisting`);
        Clava.rebuild();

        fun = getFunction();
        const flat = new StructFlattener(new LightStructFlattener());
        this.log("Applying struct flattening");
        flat.flattenAll(fun);
        this.generateCode(`${SourceCodeOutput.SRC_PARENT}/${folderName}/t3-flattening`);
        this.log(`Code generated at ${SourceCodeOutput.SRC_PARENT}/${folderName}/t3-flattening`);
        Clava.rebuild();

        return getFunction();
    }

    protected buildBody(clusterFun: FunctionJp, bridgeFun: FunctionJp, debug: boolean): Scope {
        this.logWarning("XRT C backend not implemented yet, outputting an empty wrapper function");
        return bridgeFun.body!;
    }
}