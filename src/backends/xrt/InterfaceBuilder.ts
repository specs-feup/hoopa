import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
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
        this.removeUnnecessaryArgs(interfaceDesc, clusterFun, bridgeFun);
        this.log(`Interface built.`);
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
        for (let i = 0; i < clusterFun.params.length; i++) {
            if (!toRemove.includes(i)) {
                newClusterParams.push(clusterFun.params[i]);
            }
        }
        clusterFun.setParams(newClusterParams);

        // Remove args in cluster call
        const newClusterArgs = [];
        for (let i = 0; i < clusterCall.args.length; i++) {
            if (!toRemove.includes(i)) {
                newClusterArgs.push(clusterCall.args[i]);
            }
        }
        const newClusterCall = ClavaJoinPoints.call(clusterFun, ...newClusterArgs);
        clusterCall.replaceWith(newClusterCall);

    }
}