import Clava from "@specs-feup/clava/api/clava/Clava.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { FileJp, FunctionJp, Statement, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js"
import Query from "@specs-feup/lara/api/weaver/Query.js";
import chalk from "chalk";
import { execSync } from "child_process";

export class FramaC {
    constructor() { }

    public getStatsForFile(file: FileJp, dir: string): FramaCFileReport {
        const path = `${dir}/${file.filename}`;
        const command = `frama-c -metrics -metrics-by-function ${path}`;

        const pragmas = this.disablePragmas(file, dir);
        const output = this.runFramaC(command);
        this.reenablePragmas(pragmas, dir);

        if (output === "") {
            return nullReport;
        }
        const splitOutput = output.split("Global metrics");
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

        const report: FramaCFileReport = {
            name: file.filename,
            sloc: toNumber(lines[1]),
            decisionPoints: toNumber(lines[2]),
            globalVariables: toNumber(lines[3]),
            ifs: toNumber(lines[4]),
            loops: toNumber(lines[5]),
            gotos: toNumber(lines[6]),
            assignments: toNumber(lines[7]),
            exitPoints: toNumber(lines[8]),
            functions: toNumber(lines[9]),
            functionCalls: toNumber(lines[10]),
            pointerDereferences: toNumber(lines[11]),
            cyclomaticComplexity: toNumber(lines[12])
        };
        return report;
    }

    private disablePragmas(file: FileJp, dir: string): Statement[] {
        const pragmas = Query.searchFrom(file, WrapperStmt, (stmt) => {
            const code = stmt.code.trim();
            return code.startsWith("#pragma");
        }).get();
        const comments: Statement[] = pragmas.map((pragma) => {
            const commented = ClavaJoinPoints.stmtLiteral(`// ${pragma.code}`);
            pragma.replaceWith(commented);
            return commented;
        });
        Clava.writeCode(dir);
        this.log(`Disabled ${comments.length} pragmas in file ${file.filename}`);
        return comments;
    }

    private reenablePragmas(comments: Statement[], dir: string): void {
        comments.forEach((comment) => {
            const code = comment.code.trim().substring(2).trim();
            const pragma = ClavaJoinPoints.stmtLiteral(code);
            comment.replaceWith(pragma);
        });
        Clava.writeCode(dir);
        this.log(`Re-enabled ${comments.length} pragmas`);
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

export type FramaCFileReport = {
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

export const nullReport: FramaCFileReport = {
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