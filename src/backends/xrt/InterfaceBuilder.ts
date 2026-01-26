import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { readFileSync } from "fs";
import { join } from "path";

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

    }
}

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