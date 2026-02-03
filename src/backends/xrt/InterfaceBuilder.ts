import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { Call, Expression, FunctionJp, ParenExpr, PointerType, UnaryOp, Varref, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import cluster from "cluster";
import { readFileSync } from "fs";
import { join } from "path";

export enum ArgType {
    STRUCT_POINTER = "STRUCT_POINTER",
    WRAPPED_STRUCT_POINTER = "WRAPPED_STRUCT_POINTER",
    PRIMITIVE = "PRIMITIVE",
    PRIMITIVE_POINTER = "PRIMITIVE_POINTER",
    PRIMITIVE_CONST = "PRIMITIVE_CONST",
}

export enum LivenessType {
    LIVEIN = "LIVEIN",
    LIVEOUT = "LIVEOUT",
    LIVEOUT_USEDLATER = "LIVEOUT-USEDLATER",
}

export type InterfaceArg = {
    name: string;
    type: string;
    argType: ArgType;
    sizeInBytes: number;
    liveness: LivenessType;
};

export type InterfaceDescription = {
    inData: Array<InterfaceArg>;
    outData: Array<InterfaceArg>;
};

export class InterfaceBuilder extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("InterfaceBuilder", silent);
    }

    public readInterface(path: string): InterfaceDescription {
        const desc = {
            inData: this.readCsv(join(path, "in.csv")),
            outData: this.readCsv(join(path, "out.csv")),
        }
        return desc;
    }

    private readCsv(path: string): Array<InterfaceArg> {
        const args: InterfaceArg[] =
            readFileSync(path, 'utf8')
                .trim()
                .split('\n')
                .map((line) => {
                    const [name, type, argType, sizeInBytes, liveness] = line.split(',');

                    return {
                        name,
                        type,
                        argType: argType as ArgType,
                        sizeInBytes: Number(sizeInBytes),
                        liveness: liveness as LivenessType,
                    };
                });
        return args;
    }

    public buildInterface(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        this.log(`Building interface in bridge function ${bridgeFun.name}`);
        //this.removeWrappers(interfaceDesc, clusterFun, bridgeFun);
        this.fixPragmaErrors(clusterFun);
        this.removeUnnecessaryArgs(interfaceDesc, clusterFun, bridgeFun);
        this.initLiveOutUsedLaterArgs(interfaceDesc, clusterFun, bridgeFun);
        this.transformPointersToConst(interfaceDesc, clusterFun, bridgeFun);
        this.annotateClusterFunction(clusterFun, interfaceDesc);
        this.log(`Interface built.`);
    }

    private transformPointersToConst(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        this.log(`  Transforming PRIMITIVE_CONST pointer arguments to pass-by-value in cluster function ${clusterFun.name}.`);
        for (const inData of interfaceDesc.inData) {
            if (inData.argType !== ArgType.PRIMITIVE_CONST) {
                continue;
            }
            const clusterCall = Query.searchFrom(bridgeFun, Call, { name: clusterFun.name }).get()[0];
            const clusterCallArgIdx = [];
            for (let i = 0; i < clusterCall.args.length; i++) {
                const ref = Query.searchFromInclusive(clusterCall.args[i], Varref, { name: inData.name }).get()[0];
                if (ref && clusterFun.params[i].type.isPointer) {
                    clusterCallArgIdx.push(i);
                }
            }

            for (const argIdx of clusterCallArgIdx) {
                // Update call to cluster function to pass by value
                const arg = clusterCall.args[argIdx];
                const ref = Query.searchFromInclusive(arg, Varref).get()[0];
                if (ref) {
                    let parent = ref.parent;
                    while (parent instanceof ParenExpr) {
                        parent = parent.parent;
                    }
                    if (parent instanceof UnaryOp && parent.kind === 'addr_of') {
                        console.log(`    Replacing ${parent.code} with ${ref.name} in cluster call.`);
                        clusterCall.setArg(argIdx, ref);
                    }
                }
                // Update cluster function parameter to be by value
                const param = clusterFun.params[argIdx];
                if (param.type instanceof PointerType) {
                    const newType = param.type.pointee;
                    param.setType(newType);
                    this.log(`    Changed parameter ${param.name} type from pointer to ${newType.code}.`);

                    for (const ref of Query.searchFrom(clusterFun, Varref, { name: param.name }).get()) {
                        let parent = ref.parent;
                        while (parent instanceof ParenExpr) {
                            parent = parent.parent;
                        }
                        if (parent instanceof UnaryOp && parent.operator === '*') {
                            parent.replaceWith(ref);
                            // An additional cleanup, because it comes for free
                            if (parent.parent instanceof ParenExpr) {
                                parent.parent.replaceWith(ref);
                            }
                        }
                    }
                    this.log(`  Updated all references to parameter ${param.name} to dereference the pointer.`);
                }
            }
        }
        InterfaceBuilder.updateSignatures(clusterFun);
    }

    private fixPragmaErrors(clusterFun: FunctionJp): void {
        for (const pragma of Query.searchFrom(clusterFun, WrapperStmt, (p) => p.code.startsWith('#pragma clava malloc_size')).get()) {
            const pragmaStr = pragma.code;

            const { max, min, avg } = Object.fromEntries(
                [...pragmaStr.matchAll(/(max|min|avg)\s*=\s*(-?\d+(?:\.\d+)?)/gi)]
                    .map(m => [m[1].toLowerCase(), Number(m[2])])
            ) as { max?: number; min?: number; avg?: number };
            if (max == undefined || min == undefined) {
                continue;
            }
            if (max < min) {
                const newPragma = ClavaJoinPoints.stmtLiteral(`#pragma clava malloc_size max=${min} min=${max} avg=${avg ?? min}`);
                pragma.replaceWith(newPragma);
                this.log(`  Fixed pragma malloc_size with max < min at ${pragma.filename}:${pragma.line}`);
            }
        }
    }

    private annotateClusterFunction(clusterFun: FunctionJp, interfaceDesc: InterfaceDescription): void {
        this.log(`  Annotating cluster function ${clusterFun.name} with interface metadata.`);
        const pragmaInfo = new Map<String, any>();

        for (const inData of interfaceDesc.inData) {
            pragmaInfo.set(inData.name, { argType: inData.argType, in: inData.liveness, out: null, size: inData.sizeInBytes });
        }
        for (const outData of interfaceDesc.outData) {
            if (pragmaInfo.has(outData.name)) {
                const existing = pragmaInfo.get(outData.name);
                existing.out = outData.argType;
                pragmaInfo.set(outData.name, existing);
            } else {
                pragmaInfo.set(outData.name, { argType: outData.argType, in: null, out: outData.liveness, size: outData.sizeInBytes });
            }
        }
        for (const [argName, info] of pragmaInfo) {
            const pragmaStr = `#pragma clava param=${argName} type=${info.argType} in=${info.in ?? 'NONE'} out=${info.out ?? 'NONE'} size=${info.size}`;
            const pragmaStmt = ClavaJoinPoints.stmtLiteral(pragmaStr);
            clusterFun.body.insertBegin(pragmaStmt);
            this.log(`    Added pragma for argument ${argName}: ${pragmaStr}`);
        }
    }

    private initLiveOutUsedLaterArgs(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        const toInit: InterfaceArg[] = interfaceDesc.outData.filter(arg => {
            const isLiveOutUsedLater = arg.liveness === LivenessType.LIVEOUT_USEDLATER;
            const notInLiveIn = interfaceDesc.inData.find(inArg => inArg.name === arg.name) === undefined;
            return isLiveOutUsedLater && notInLiveIn;
        });

        toInit.reverse();
        for (const arg of toInit) {
            this.log(`  Initializing LIVEOUT-USEDLATER argument ${arg.name} before cluster call.`);
            const paramIndex = bridgeFun.params.findIndex(param => param.name === arg.name);
            const param = bridgeFun.params[paramIndex];
            const varref = param.varref();
            const size = arg.sizeInBytes;

            const isWrapped = arg.argType === ArgType.WRAPPED_STRUCT_POINTER;
            const lhs = isWrapped ? ClavaJoinPoints.unaryOp('*', varref) : varref;

            const voidPtrType = ClavaJoinPoints.type("void*");
            const mallocSize = ClavaJoinPoints.integerLiteral(size);
            const rhs = ClavaJoinPoints.callFromName("malloc", voidPtrType, mallocSize);

            const binOp = ClavaJoinPoints.binaryOp('=', lhs, rhs);
            const exprStmt = ClavaJoinPoints.exprStmt(binOp);

            bridgeFun.body.insertBegin(exprStmt);
        }
    }

    public static updateSignatures(fun: FunctionJp): void {
        for (const sig of Query.search(FunctionJp, (f) => f.name === fun.name && !f.isImplementation).get()) {
            const newSig = ClavaJoinPoints.functionDecl(fun.name, fun.returnType, ...fun.params)
            sig.replaceWith(newSig);
        }
    }

    private removeUnnecessaryArgs(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        const toRemove: Number[] = [];
        const clusterCall = Query.searchFrom(bridgeFun, Call, { name: clusterFun.name }).get()[0];

        const argHasSymbol = (arg: Expression, symbol: string): boolean => {
            return arg.getDescendantsAndSelf("varref").some(v => (v as Varref).name === symbol);
        }
        for (let i = 0; i < clusterCall.args.length; i++) {
            const isIn = interfaceDesc.inData.find(arg => argHasSymbol(clusterCall.args[i], arg.name));
            const isOut = interfaceDesc.outData.find(arg => argHasSymbol(clusterCall.args[i], arg.name));

            if (!isIn && !isOut) {
                toRemove.push(i);
            }
        }
        this.log(`  Found ${toRemove.length} unnecessary arguments to remove.`);

        // Remove params in cluster fun
        const newClusterParams = [];
        const removedParams = [];
        for (let i = 0; i < clusterFun.params.length; i++) {
            if (!toRemove.includes(i)) {
                newClusterParams.push(clusterFun.params[i]);
            }
            else {
                removedParams.push(clusterFun.params[i]);
            }
        }
        clusterFun.setParams(newClusterParams);

        // Create local variables for removed params
        removedParams.reverse();
        for (const param of removedParams) {
            const singlePointerType = param.type.code.endsWith('**') ?
                ClavaJoinPoints.type(param.type.code.slice(0, -1)) :
                param.type;
            const localVar = ClavaJoinPoints.varDeclNoInit(param.name, singlePointerType);
            const declStmt = ClavaJoinPoints.declStmt(localVar);
            clusterFun.body.insertBegin(declStmt);

            for (const ref of Query.searchFrom(clusterFun.body, Varref, { name: param.name }).get()) {
                let parent = ref.parent;
                while (parent instanceof ParenExpr) {
                    parent = parent.parent;
                }
                if (parent instanceof UnaryOp && parent.operator === '*') {
                    parent.replaceWith(ref);
                    // An additional cleanup, because it comes for free
                    if (ref.parent instanceof ParenExpr) {
                        ref.parent.replaceWith(ref);
                    }
                }
                else if (parent instanceof Call) {
                    let idx = -1;
                    for (let i = 0; i < parent.args.length; i++) {
                        const arg = parent.args[i];
                        if (arg.getDescendantsAndSelf("varref").some(v => (v as Varref).name === param.name)) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx == -1) {
                        throw new Error(`Could not find argument index for param ${param.name} in call ${parent.code}`);
                    }
                    if (parent.argList[idx].type.code.endsWith('**')) {
                        const addrOf = ClavaJoinPoints.unaryOp('&', ref);
                        ref.replaceWith(addrOf);
                    }
                }
            }
        }

        // Remove args in cluster call
        const newClusterArgs = [];
        for (let i = 0; i < clusterCall.args.length; i++) {
            if (!toRemove.includes(i)) {
                newClusterArgs.push(clusterCall.args[i]);
            }
        }
        const newClusterCall = ClavaJoinPoints.call(clusterFun, ...newClusterArgs);
        clusterCall.replaceWith(newClusterCall);

        InterfaceBuilder.updateSignatures(clusterFun);
    }
}