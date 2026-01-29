import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { Call, Expression, FunctionJp, ParenExpr, PointerType, UnaryOp, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import cluster from "cluster";
import { readFileSync } from "fs";
import { join } from "path";

export enum ArgType {
    STRUCT_POINTER = "STRUCT_POINTER",
    WRAPPED_STRUCT_POINTER = "WRAPPED_STRUCT_POINTER",
    PRIMITIVE = "PRIMITIVE",
    PRIMITIVE_POINTER = "PRIMITIVE_POINTER",
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
        this.removeUnnecessaryArgs(interfaceDesc, clusterFun, bridgeFun);
        this.initLiveOutUsedLaterArgs(interfaceDesc, clusterFun, bridgeFun);
        this.log(`Interface built.`);
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

    private removeWrappers(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        const clusterCall = Query.searchFrom(bridgeFun, Call, { name: clusterFun.name }).get()[0];
        const bridgeCall = Query.search(Call, { name: bridgeFun.name }).get()[0];
        const toUnwrapTentative: InterfaceArg[] = [
            ...interfaceDesc.inData.filter(arg => arg.argType === ArgType.WRAPPED_STRUCT_POINTER),
            ...interfaceDesc.outData.filter(arg => arg.argType === ArgType.WRAPPED_STRUCT_POINTER)
        ];

        const toUnwrap: InterfaceArg[] = toUnwrapTentative.filter(arg => {
            const ok = interfaceDesc.outData.find(outArg => outArg.name === arg.name && outArg.liveness === LivenessType.LIVEOUT_USEDLATER) === undefined;
            if (!ok) {
                this.log(`  Not unwrapping argument ${arg.name} as it is LIVEOUT-USEDLATER`);
            }
            return ok;
        });
        this.log(`  Found ${toUnwrap.length} wrapped struct pointers to unwrap.`);

        const indexes = new Set<number>();
        toUnwrap.forEach(arg => {
            for (let i = 0; i < clusterCall.args.length; i++) {
                if (clusterCall.args[i].code === arg.name) {
                    indexes.add(i);
                }
            }
        });

        for (const index of indexes) {
            // Update bridge fun to accept struct directly
            const bridgeParam = bridgeFun.params[index];
            const type = bridgeParam.type;
            console.log(bridgeParam.code, type.code, type.joinPointType);
            const derefType = ClavaJoinPoints.typeLiteral(type.code.slice(0, -1));
            bridgeFun.setParamType(index, derefType);

            // Update bridge call to pass the struct directly
            const callArg = bridgeCall.args[index];
            let child = callArg.children[0];
            while (child instanceof ParenExpr) {
                child = child.children[0];
            }
            bridgeCall.setArg(index, child as Expression);

            // Update cluster fun to accept struct directly
            const clusterParam = clusterFun.params[index];
            const clusterDerefType = ClavaJoinPoints.typeLiteral(clusterParam.type.code.slice(0, -1));
            clusterFun.setParamType(index, clusterDerefType);

            for (const ref of Query.searchFrom(clusterFun.body, Varref, { name: clusterParam.name }).get()) {
                let parent = ref.parent;
                while (parent instanceof ParenExpr) {
                    parent = parent.parent;
                }
                if (parent instanceof UnaryOp && parent.operator === '*') {
                    parent.replaceWith(ref);
                } else {
                    const addrOf = ClavaJoinPoints.unaryOp('&', ref);
                    ref.replaceWith(addrOf);
                }
            }
        }
        this.updateSignatures(clusterFun);
        this.updateSignatures(bridgeFun);
    }

    private updateSignatures(fun: FunctionJp): void {
        for (const sig of Query.search(FunctionJp, (f) => f.name === fun.name && !f.isImplementation).get()) {
            const newSig = ClavaJoinPoints.functionDecl(fun.name, fun.returnType, ...fun.params)
            sig.replaceWith(newSig);
        }
    }

    private removeUnnecessaryArgs(interfaceDesc: InterfaceDescription, clusterFun: FunctionJp, bridgeFun: FunctionJp): void {
        const toRemove: Number[] = [];
        const clusterCall = Query.searchFrom(bridgeFun, Call, { name: clusterFun.name }).get()[0];

        for (let i = 0; i < clusterCall.args.length; i++) {
            const isIn = interfaceDesc.inData.find(arg => arg.name === clusterCall.args[i].code);
            const isOut = interfaceDesc.outData.find(arg => arg.name === clusterCall.args[i].code);

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

        this.updateSignatures(clusterFun);
    }
}