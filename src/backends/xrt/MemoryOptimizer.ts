import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import { LightStructFlattener } from "@specs-feup/clava-code-transforms/LightStructFlattener";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ArrayAccess, BinaryOp, Call, FunctionJp, Loop, ParenExpr, PointerType, Statement, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { InterfaceBuilder } from "./InterfaceBuilder.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export type MemoryOptimizerOptions = {
    totalMemoryLimitPercent: number; // e.g., 0.9 for 90%
    scalarToVarThreshold: number; // in bytes
    partialMappingMaxFactor: number; // optional, default 4
};

export const defaultOptions: MemoryOptimizerOptions = {
    totalMemoryLimitPercent: 0.9,
    scalarToVarThreshold: 32,
    partialMappingMaxFactor: 4
};

export type HeuristicResult = {
    mappedByA: number;
    sizeMappedByA: number;
    mappedByB: number;
    sizeMappedByB: number;
    mappedByC: number;
    sizeMappedByC: number;
    initialMemoryUsage: number;
    finalMemoryUsage: number;
    finalMemoryPercent: number;
    availableFPGAMemory: number;
}

export class MemoryOptimizer extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("MemoryOptimizer", silent);
    }

    public apply(clusterFun: FunctionJp, bridgeFun: FunctionJp, options: MemoryOptimizerOptions = defaultOptions): HeuristicResult {
        const res: HeuristicResult = {
            mappedByA: 0,
            sizeMappedByA: 0,
            mappedByB: 0,
            sizeMappedByB: 0,
            mappedByC: 0,
            sizeMappedByC: 0,
            initialMemoryUsage: 0,
            finalMemoryUsage: 0,
            finalMemoryPercent: 0,
            availableFPGAMemory: 0
        };

        this.log("Starting memory optimization");
        let currentMemUsage = 0;

        const [usedBytes, totalBytes, availableBytes] = this.getAvailableBRAM(clusterFun);
        if (totalBytes <= 0 || Number.isNaN(totalBytes)) {
            this.logError("Could not determine available BRAM from pragmas. Aborting memory optimization.");
            return res;
        }
        this.log(`Initial BRAM Usage: ${usedBytes} bytes used out of ${totalBytes} bytes (${(usedBytes * 100 / totalBytes).toFixed(2)}%)`);
        currentMemUsage += usedBytes;

        res.initialMemoryUsage = usedBytes;
        res.availableFPGAMemory = availableBytes;

        // Heuristic A: map kernel-only arrays communicated as params to BRAM
        this.logLine();
        this.log("Applying Heuristic A: Mapping kernel-only arrays to BRAM");

        const mappedScalars = this.applyHeuristicScalarsToVars(clusterFun, bridgeFun, options.scalarToVarThreshold);
        this.log(`Mapped ${mappedScalars} scalar pointer parameters to variables where possible.`);
        clusterFun = this.regenFunction(clusterFun.name);

        const [mappedKernelOnlyArrays, usedMemoryInA] = this.applyHeuristicKernelArraysToBRAM(clusterFun, bridgeFun, currentMemUsage, totalBytes);
        currentMemUsage += usedMemoryInA;

        this.log(`Mapped ${mappedKernelOnlyArrays} kernel-only array parameters with ${usedMemoryInA} bytes to BRAM.`);
        this.log(`Current estimated BRAM usage: ${currentMemUsage} (${(currentMemUsage * 100 / totalBytes).toFixed(2)}%)`);
        clusterFun = this.regenFunction(clusterFun.name);

        res.mappedByA = mappedScalars + mappedKernelOnlyArrays;
        res.sizeMappedByA = usedMemoryInA;

        if (currentMemUsage > totalBytes * options.totalMemoryLimitPercent) {
            this.logLine();
            this.log("Reached total memory usage limit after Heuristic A");
            res.finalMemoryUsage = currentMemUsage;
            res.finalMemoryPercent = (currentMemUsage * 100) / totalBytes;
            return res;
        }

        // Heuristic B: map live-in buffers to BRAM
        this.logLine();
        this.log("Applying Heuristic B: Mapping live-in buffers to BRAM");
        const [mappedBuffers, usedMemoryInB] = this.applyHeuristicLiveInToBRAM(clusterFun, currentMemUsage, totalBytes);
        currentMemUsage += usedMemoryInB;

        this.log(`Mapped ${mappedBuffers} live-in buffer parameters with ${usedMemoryInB} bytes to BRAM.`);
        this.log(`Current estimated BRAM usage: ${currentMemUsage} (${(currentMemUsage * 100 / totalBytes).toFixed(2)}%)`);
        clusterFun = this.regenFunction(clusterFun.name);

        res.mappedByB = mappedBuffers;
        res.sizeMappedByB = usedMemoryInB;

        if (currentMemUsage > totalBytes * options.totalMemoryLimitPercent) {
            this.logLine();
            this.log("Reached total memory usage limit after Heuristic B");
            res.finalMemoryUsage = currentMemUsage;
            res.finalMemoryPercent = (currentMemUsage * 100) / totalBytes;
            return res;
        }

        // Heuristic C: map most promising array partially
        this.logLine();
        this.log("Applying Heuristic C: Partially mapping most promising array to BRAM");
        const usedMemoryInC = this.applyHeuristicPartialMapping(clusterFun, currentMemUsage, totalBytes, options.partialMappingMaxFactor);
        currentMemUsage += usedMemoryInC;

        res.mappedByC = usedMemoryInC > 0 ? 1 : 0;
        res.sizeMappedByC = usedMemoryInC;

        this.logLine();
        this.log(`Final estimated BRAM usage: ${res.finalMemoryUsage} bytes (${res.finalMemoryPercent.toFixed(2)}%)`);
        this.log("Memory optimization completed.");

        res.finalMemoryUsage = currentMemUsage;
        res.finalMemoryPercent = (currentMemUsage * 100) / totalBytes;
        return res;
    }

    private applyHeuristicPartialMapping(clusterFun: FunctionJp, prevMemUsage: number, totalBytes: number, maxFactor: number): number {
        let mostPromisingIndex = -1;
        let mostAccesses = -1;
        let arraySize = 0;
        for (let i = 0; i < clusterFun.params.length; i++) {
            const param = clusterFun.params[i];
            const [valid, size] = this.isValidLiveIn(clusterFun, param.name);
            const hasAlreadyBeenMapped = Query.searchFrom(clusterFun.body, Vardecl, { name: `local_${param.name}` }).first() != null;
            if (param.name.startsWith("memregion_") || param.name.startsWith("rtr_val") || !param.type.isPointer || !valid || hasAlreadyBeenMapped) {
                continue;
            }
            //this.log(`Analyzing parameter ${param.name} for partial mapping:`);
            const [reads, writes, uniqueReads, uniqueWrites] = this.getParamReadCount(clusterFun, param.name);
            this.log(`  Parameter ${param.name} has ${reads} reads and ${writes} writes (unique reads: ${uniqueReads}, unique writes: ${uniqueWrites})`);
            const readWrites = reads + writes;

            if (readWrites > mostAccesses) {
                if (prevMemUsage + (size / maxFactor) < totalBytes) {
                    mostAccesses = reads + writes;
                    mostPromisingIndex = i;
                    arraySize = size;
                    this.log(`  Parameter ${param.name} is currently the most promising for partial mapping.`);
                }
                else {
                    this.log(`  Parameter ${param.name} cannot be partially mapped: would exceed total memory limit.`);
                }
            }
        }
        if (mostPromisingIndex == -1) {
            this.log("  No valid parameter found for partial mapping.");
            return 0;
        }
        const chosenParam = clusterFun.params[mostPromisingIndex];
        this.log(`  Most promising parameter for partial mapping is ${chosenParam.name} with ${mostAccesses} accesses.`);

        let usedMemory = 0;
        if (prevMemUsage + arraySize < totalBytes) {
            usedMemory = arraySize;
            this.log(`  Fully mapping parameter ${chosenParam.name} to use ${arraySize} bytes.`);
            this.convertParamToLocal(clusterFun, mostPromisingIndex, arraySize, true);

        }
        else {
            const remainingMemory = totalBytes - prevMemUsage;
            const actualFactor = Math.ceil(arraySize / remainingMemory);
            usedMemory = arraySize / actualFactor;
            this.log(`  Partially mapping parameter ${chosenParam.name} to use ${usedMemory} bytes (factor ${actualFactor}).`);

        }
        return usedMemory;
    }

    private getParamReadCount(clusterFun: FunctionJp, paramName: string): [number, number, number, number] {
        let reads = 0;
        let writes = 0;
        let uniqueReads = 0;
        let uniqueWrites = 0;
        for (const varref of Query.searchFrom(clusterFun.body, Varref, { name: paramName })) {
            const arrayAccess = varref.getAncestor("arrayAccess") as ArrayAccess | null;
            if (arrayAccess != null) {
                const stmt = arrayAccess.getAncestor("statement") as Statement | null;
                const binOp = arrayAccess.getAncestor("binaryOp") as BinaryOp | null;
                if (binOp != null && binOp.operator === "=") {
                    const allLhsRefs = binOp.getDescendantsAndSelf("varref");
                    const isInLeft = allLhsRefs.some(r => r.astId === varref.astId);
                    if (isInLeft) {
                        //this.log(`    Found write to ${paramName}: ${stmt!.code}`);
                        uniqueWrites++;
                        writes += this.estimateAccesses(arrayAccess);
                    }
                    else {
                        //this.log(`    Found read to ${paramName}: ${stmt!.code}`);
                        uniqueReads++;
                        reads += this.estimateAccesses(arrayAccess);
                    }
                }
                else {
                    //this.log(`    Found read to ${paramName}: ${stmt!.code}`);
                    uniqueReads++;
                    reads += this.estimateAccesses(arrayAccess);
                }
            }
        }
        //this.log(`    Total unique reads: ${uniqueReads}, unique writes: ${uniqueWrites}`);
        return [reads, writes, uniqueReads, uniqueWrites];
    }

    private estimateAccesses(arrayAccess: ArrayAccess): number {
        let parent = arrayAccess.parent;
        let n = 1;

        while (!(parent instanceof FunctionJp)) {
            if (parent instanceof Loop) {
                const firstStmt = parent.body.stmts[0];
                const code = firstStmt.code.trim().toLowerCase();
                if (code.startsWith("#pragma hls loop_tripcount")) {
                    const match = code.match(/max\s*=\s*(\d+)/);
                    if (match) {
                        const tripCount = parseInt(match[1]);
                        n *= tripCount;
                    }
                    else {
                        this.logWarning(`Could not parse trip count from pragma: ${firstStmt.code}`);
                    }
                }
            }
            parent = parent.parent;
        }
        return n;
    }

    private applyHeuristicLiveInToBRAM(clusterFun: FunctionJp, prevMemUsage: number, totalBytes: number): [number, number] {
        let ongoingMemUsage = 0;
        let mappedCount = 0;
        const toMap: number[] = [];
        const toMapSizes: number[] = [];

        for (let i = 0; i < clusterFun.params.length; i++) {
            const param = clusterFun.params[i];
            if (!param.name.startsWith("memregion_") && !param.name.startsWith("rtr_val") && param.type.isPointer) {
                const [valid, size] = this.isValidLiveIn(clusterFun, param.name);
                if (valid) {
                    toMap.push(i);
                    toMapSizes.push(size);
                }
            }
        }
        const pairs = toMap.map((index, idx) => [index, toMapSizes[idx]]);
        pairs.sort((a, b) => a[1] - b[1]);
        this.log(`Found ${pairs.length} valid live-in parameters to map to BRAM.`);

        for (const [paramIndex, size] of pairs) {
            if (prevMemUsage + ongoingMemUsage + size < totalBytes) {
                const mapToBRAM = size >= 32;
                this.mapParamToLocal(clusterFun, paramIndex, size, mapToBRAM);
                mappedCount++;
                ongoingMemUsage += size;
            }
            else {
                this.log(`  Cannot map parameter index ${paramIndex} of size ${size} bytes to BRAM: would exceed total memory limit.`);
                return [mappedCount, ongoingMemUsage];
            }
        }
        return [mappedCount, ongoingMemUsage];
    }

    private mapParamToLocal(clusterFun: FunctionJp, paramIndex: number, size: number, mapToBRAM: boolean = false): Vardecl {
        const param = clusterFun.params[paramIndex];
        const localName = `local_${param.name}`;
        const type = param.type;
        const newStatements = [];

        const newDecl = ClavaJoinPoints.varDeclNoInit(localName, type);
        const declStmt = ClavaJoinPoints.declStmt(newDecl);
        newStatements.push(declStmt);

        if (mapToBRAM) {
            const pragma = `#pragma HLS bind_storage variable=${localName} type=RAM_2P impl=BRAM`;
            const pragmaStmt = ClavaJoinPoints.stmtLiteral(pragma);
            newStatements.push(pragmaStmt);
        }

        const baseType = (type as PointerType).pointee;
        const baseTypeSize = LightStructFlattener.getSizeOfBuiltinType(baseType);

        if (size == baseTypeSize) {
            const derefParam = ClavaJoinPoints.unaryOp("*", param.varref());
            const derefLocal = ClavaJoinPoints.unaryOp("*", newDecl.varref());
            const assignOp = ClavaJoinPoints.binaryOp("=", derefLocal, derefParam);
            const assignStmt = ClavaJoinPoints.exprStmt(assignOp);
            newStatements.push(assignStmt);
        }
        else {
            const memcpyArgs = [newDecl.varref(), param.varref(), ClavaJoinPoints.integerLiteral(size)];
            const memcpyType = ClavaJoinPoints.type("void*");
            const memcpyCall = ClavaJoinPoints.callFromName("memcpy", memcpyType, ...memcpyArgs);
            const memcpyStmt = ClavaJoinPoints.exprStmt(memcpyCall);
            newStatements.push(memcpyStmt);
        }

        newStatements.reverse();
        for (const stmt of newStatements) {
            clusterFun.body.insertBegin(stmt);
        }

        for (const ref of Query.searchFrom(clusterFun.body, Varref, { name: param.name })) {
            const newRef = newDecl.varref();
            ref.replaceWith(newRef);
        }
        return newDecl;
    }

    private isValidLiveIn(clusterFun: FunctionJp, paramName: string): [boolean, number] {
        for (const stmt of clusterFun.body.stmts) {
            const pragmaCode = stmt.code.trim();
            if (pragmaCode.startsWith("#pragma clava param")) {
                const name = pragmaCode.match(/param\s*=\s*(\w+)/)?.[1];
                if (name == undefined || !paramName.startsWith(name)) {
                    continue;
                }
                const isLiveIn = pragmaCode.includes("LIVEIN");
                const isLiveOut = pragmaCode.includes("LIVEOUT_USEDLATER");
                const isValid = isLiveIn && !isLiveOut;

                const sizeMatch = pragmaCode.match(/size\s*=\s*(\d+)/);
                let size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

                // Extremely ugly hack, valid only for CortexSuite structs:
                size -= 8;
                // Directives give us the size of the original struct, but since we flattened it,
                // we need to subtract the size of the scalar fields (usually 2 ints = 8 bytes).
                // The struct flattener needs to update the interface directives to make this generic

                return [isValid, size];
            }
        }
        return [false, 0];
    }


    private applyHeuristicKernelArraysToBRAM(clusterFun: FunctionJp, bridgeFun: FunctionJp, prevMemUsage: number, totalBytes: number): [number, number] {
        let ongoingMemUsage = 0;
        let mappedCount = 0;
        const toMap: number[] = [];
        const toMapSizes: number[] = [];

        for (let i = 0; i < clusterFun.params.length; i++) {
            const param = clusterFun.params[i];

            if (param.name.startsWith("memregion_") && param.type.isPointer) {
                const size = parseInt(param.name.split("size")[1]);
                toMap.push(i);
                toMapSizes.push(size);
            }
        }
        const pairs = toMap.map((index, idx) => [index, toMapSizes[idx]]);
        pairs.sort((a, b) => a[1] - b[1]);

        const toRemove: number[] = [];
        for (const [paramIndex, size] of pairs) {
            if (prevMemUsage + ongoingMemUsage + size < totalBytes) {
                this.convertParamToLocal(clusterFun, paramIndex, size, true);
                mappedCount++;
                ongoingMemUsage += size;
                toRemove.push(paramIndex);
            }
        }
        this.removeParams(clusterFun, bridgeFun, toRemove);
        return [mappedCount, ongoingMemUsage];
    }

    private applyHeuristicScalarsToVars(clusterFun: FunctionJp, bridgeFun: FunctionJp, threshold: number): number {
        const toRemove: number[] = [];

        for (let i = 0; i < clusterFun.params.length; i++) {
            const param = clusterFun.params[i];

            if (param.name.startsWith("memregion_") && param.type.isPointer) {
                const size = parseInt(param.name.split("size")[1]);
                if (size < threshold) {
                    toRemove.push(i);
                    this.convertParamToLocal(clusterFun, i, size, false);
                }
            }
        }
        this.removeParams(clusterFun, bridgeFun, toRemove);
        return toRemove.length;
    }

    private regenFunction(funName: string): FunctionJp {
        // try {
        //     Clava.rebuild();
        // }
        // catch (e) {
        //     this.logError(`Error during Clava rebuild: ${e}`);
        //     throw e;
        // }
        return Query.search(FunctionJp, (f) => f.name === funName && f.isImplementation).first()!;
    }

    private removeParams(clusterFun: FunctionJp, bridgeFun: FunctionJp, toRemove: number[]): void {
        // update cluster fun signature
        const newParams = clusterFun.params.filter((_, i) => !toRemove.includes(i));
        clusterFun.setParams(newParams);

        // update cluster call
        const clusterCall = Query.searchFrom(bridgeFun.body, Call, { name: clusterFun.name }).first();
        if (!clusterCall) {
            this.logError(`Cluster function call not found in bridge function.`);
            return;
        }
        const newArgList = clusterCall.args.filter((_, i) => !toRemove.includes(i));
        const newCall = ClavaJoinPoints.call(clusterFun, ...newArgList);
        clusterCall.replaceWith(newCall);

        InterfaceBuilder.updateSignatures(clusterFun);
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
