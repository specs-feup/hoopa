import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js"
import chalk from "chalk";
import { execSync } from "child_process";

export class FramaC {
    constructor() { }

    public getStatsForFunction(fun: FunctionJp, dir: string): FramaCFunctionReport {
        const file = fun.filename;
        const path = `${dir}/${file}`;
        const functionName = fun.name;

        const command = `frama-c -metrics -metrics-by-function ${path}`;
        const output = this.runFramaC(command);

        if (output === "") {
            return nullReport;
        }
        const splitOutput = output.split(functionName);
        if (splitOutput.length < 2) {
            return nullReport;
        }

        const lines = splitOutput[1].trim().split("\n");
        const toNumber = (s: string): number => {
            const parts = s.split("=");
            if (parts.length < 2) {
                return 0;
            }
            return Number(parts[1].trim());
        }

        const report: FramaCFunctionReport = {
            name: functionName,
            sloc: toNumber(lines[2]),
            decisionPoints: toNumber(lines[3]),
            globalVariables: toNumber(lines[4]),
            ifs: toNumber(lines[5]),
            loops: toNumber(lines[6]),
            gotos: toNumber(lines[7]),
            assignments: toNumber(lines[8]),
            exitPoints: toNumber(lines[9]),
            functions: toNumber(lines[10]),
            functionCalls: toNumber(lines[11]),
            pointerDereferences: toNumber(lines[12]),
            cyclomaticComplexity: toNumber(lines[13])
        };
        return report;
    }

    private runFramaC(command: string): string {
        this.log(`Running command: ${command}`);
        try {
            const output = execSync(command, { encoding: "utf8" });
            this.log(`Frama-C finished successfully`);
            return output;
        }
        catch (err) {
            this.log(`${err}`);
            return "";
        }
    }

    private log(msg: string): void {
        console.log(`[${chalk.blue("Clava-FramaC")}] ${msg}`);
    }
}

export type FramaCFunctionReport = {
    name: string;
    sloc: number;
    decisionPoints: number;
    globalVariables: number;
    ifs: number;
    loops: number;
    gotos: number;
    assignments: number;
    exitPoints: number;
    functions: number;
    functionCalls: number;
    pointerDereferences: number;
    cyclomaticComplexity: number;
};

export const nullReport: FramaCFunctionReport = {
    name: "<null>",
    sloc: 0,
    decisionPoints: 0,
    globalVariables: 0,
    ifs: 0,
    loops: 0,
    gotos: 0,
    assignments: 0,
    exitPoints: 0,
    functions: 0,
    functionCalls: 0,
    pointerDereferences: 0,
    cyclomaticComplexity: 0
};