import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { BinaryOp, Call, FunctionJp, ParenExpr, PointerType, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { InterfaceBuilder } from "./InterfaceBuilder.js";

export type MemoryOptimizerOptions = {
    scalarToVarThreshold?: number; // in bytes
};

export const defaultOptions: MemoryOptimizerOptions = {
    scalarToVarThreshold: 32,
};

export class MemoryOptimizer extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("MemoryOptimizer", silent);
    }

    public apply(clusterFun: FunctionJp, bridgeFun: FunctionJp, options: MemoryOptimizerOptions = defaultOptions): void {
        this.log("Starting memory optimization");
        let totalMemUsage = 0;

        const [usedBytes, totalBytes, availableBytes] = this.getAvailableBRAM(clusterFun);
        this.log(`BRAM Usage: ${usedBytes} bytes used out of ${totalBytes} bytes. Available: ${availableBytes} bytes.`);
        totalMemUsage += usedBytes;

        const mappedScalars = this.applyHeuristicScalarsToVars(clusterFun, bridgeFun, options.scalarToVarThreshold!);
        this.log(`Mapped ${mappedScalars} scalar pointer parameters to variables where possible.`);
    }

    private applyHeuristicScalarsToVars(clusterFun: FunctionJp, bridgeFun: FunctionJp, threshold: number): number {
        const toRemove: number[] = [];

        for (let i = 0; i < clusterFun.params.length; i++) {
            const param = clusterFun.params[i];

            if (param.name.startsWith("memregion_") && param.type.isPointer) {
                const size = parseInt(param.name.split("size")[1]);
                if (size < threshold) {
                    toRemove.push(i);

                }
            }
        }

        // update cluster fun signature
        const newParams = clusterFun.params.filter((_, i) => !toRemove.includes(i));
        clusterFun.setParams(newParams);

        // update cluster call
        const clusterCall = Query.searchFrom(bridgeFun.body, Call, { name: clusterFun.name }).first();
        if (!clusterCall) {
            this.logError(`Cluster function call not found in bridge function.`);
            return 0;
        }
        const newArgList = clusterCall.args.filter((_, i) => !toRemove.includes(i));
        const newCall = ClavaJoinPoints.call(clusterFun, ...newArgList);
        clusterCall.replaceWith(newCall);

        InterfaceBuilder.updateSignatures(clusterFun);
        return toRemove.length;
    }

    private convertParamToLocal(clusterFun: FunctionJp, paramIndex: number, size: number, mapToBRAM: boolean = false): Vardecl {
        const param = clusterFun.params[paramIndex];
        const baseType = (param.type as PointerType).pointee;
        const baseTypeSize = LightStructFlattener.getSizeOfBuiltinType(baseType);

        this.log(`  Mapping parameter ${param.name} of size ${size} to local variable.`);
        // update cluster fun
        let newVar;
        let isArray = false;
        if (baseTypeSize == size) {
            newVar = ClavaJoinPoints.varDeclNoInit(param.name, baseType);
        }
        else {
            const arrayType = ClavaJoinPoints.constArrayType(baseType, Math.ceil(size / baseTypeSize));
            newVar = ClavaJoinPoints.varDeclNoInit(param.name, arrayType);
            isArray = true;
        }
        if (mapToBRAM) {
            const pragma = `#pragma HLS bind_storage variable=${param.name} type=RAM_2P impl=BRAM`;
            const pragmaStmt = ClavaJoinPoints.stmtLiteral(pragma);
            clusterFun.body.insertBegin(pragmaStmt);
        }
        const declStmt = ClavaJoinPoints.declStmt(newVar);
        clusterFun.body.insertBegin(declStmt);

        if (isArray) {
            return newVar;
        }
        for (const ref of Query.searchFrom(clusterFun.body, Varref, { name: param.name })) {
            let parent = ref.parent;
            while (parent instanceof ParenExpr) {
                parent = parent.parent;
            }
            if (parent instanceof UnaryOp && parent.operator === "*") {
                const newRef = newVar.varref();
                parent.replaceWith(newRef);
                if (parent.parent instanceof ParenExpr) {
                    parent.parent.replaceWith(newRef);
                }
            }
        }
        for (const ref of Query.searchFrom(clusterFun.body, Varref, { name: param.name })) {
            let parent = ref.parent;
            if (parent instanceof BinaryOp && parent.operator === "=" && parent.right.code === ref.code) {
                const lhs = parent.left;
                if (lhs instanceof Varref && lhs.type.isPointer) {
                    const addrOf = ClavaJoinPoints.unaryOp("&", ref);
                    parent.setRight(addrOf);
                }
            }
        }
        return newVar;
    }

    private getAvailableBRAM(clusterFun: FunctionJp): [number, number, number] {
        for (const stmt of clusterFun.body.stmts) {
            const pragmaCode = stmt.code.trim().toLowerCase();
            if (pragmaCode.startsWith("#pragma clava bram")) {
                /**
                 * Regex Breakdown:
                 * \b(\w+)\s*=\s*(\d+)\b
                 * \b(\w+)  -> Capture the key (alphanumeric word)
                 * \s*=\s* -> Match '=' with any amount of surrounding whitespace
                 * (\d+)\b  -> Capture the value (digits)
                 */
                const regex = /\b(?<key>\w+)\s*=\s*(?<value>\d+)/g;

                const params: Record<string, number> = {};
                let match;

                while ((match = regex.exec(pragmaCode)) !== null) {
                    if (match.groups) {
                        const { key, value } = match.groups;
                        params[key] = parseInt(value, 10);
                    }
                }
                const { bram_usage, max_bram, bytes_per_bram } = params;
                if (bram_usage !== undefined && max_bram !== undefined && bytes_per_bram !== undefined) {
                    const usedBytes = bram_usage * bytes_per_bram;
                    const totalBytes = max_bram * bytes_per_bram;
                    const availableBytes = totalBytes - usedBytes;
                    return [usedBytes, totalBytes, availableBytes];
                } else {
                    this.logError("BRAM pragma is missing required parameters.");
                    return [0, 0, 0];
                }
            }
        }
        this.log("No BRAM pragma found in the function body.");
        return [0, 0, 0];
    }
}
