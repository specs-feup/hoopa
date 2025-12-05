import { FunctionJp, Loop } from "@specs-feup/clava/api/Joinpoints.js";
import { AHoopaStage } from "../AHoopaStage.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { EtgLogger } from "@specs-feup/extended-task-graph/EtgLogger";

export class InstrumentationInserter {
    private logger: EtgLogger;

    constructor(outputDir: string, appName: string) {
        this.logger = new EtgLogger("InstrumentationInserter", outputDir, appName, "Hoopa");
    }

    public instrumentLoops(fun: FunctionJp): number {
        this.logger.log(`Instrumenting loops in function ${fun.name}`);
        let loopCount = 0;

        // file pointer declared just before the function
        const fopenDeclStr = `FILE* ${fun.name}_fptr;`;
        const fopenDeclStmt = ClavaJoinPoints.stmtLiteral(fopenDeclStr);
        fun.insertBefore(fopenDeclStmt);

        // init file at the beginning of the function
        const fopenStr = `${fun.name}_fptr = fopen("loop_counts_${fun.name}.csv", "w");`;
        const fopenStmt = ClavaJoinPoints.stmtLiteral(fopenStr);
        fun.body.insertBegin(fopenStmt);

        for (const loop of Query.searchFrom(fun, Loop)) {
            this.logger.log(` Instrumenting loop at ${fun.name}:${loop.line}`);

            // declare loop counter before the loop
            const loopCounterName = IdGenerator.next("_loop_cntr_")
            const loopCounterDecl = ClavaJoinPoints.varDecl(loopCounterName, ClavaJoinPoints.integerLiteral(0));
            const declStmt = ClavaJoinPoints.declStmt(loopCounterDecl);
            loop.insertBefore(declStmt);

            // write loop count to file after the loop
            const incrementExpr = ClavaJoinPoints.unaryOp("post_inc", loopCounterDecl.varref());
            const incrementStmt = ClavaJoinPoints.exprStmt(incrementExpr);
            loop.body.insertBegin(incrementStmt);

            // write to file after the loop
            const fprintfStr = `fprintf(${fun.name}_fptr, "${fun.name}:${loop.line},%d\\n", ${loopCounterName});`;
            const fprintfStmt = ClavaJoinPoints.stmtLiteral(fprintfStr);
            loop.insertAfter(fprintfStmt);

            loopCount++;
        }
        return loopCount;
    }

    public instrumentMallocs(): number {
        return 0;
    }

}