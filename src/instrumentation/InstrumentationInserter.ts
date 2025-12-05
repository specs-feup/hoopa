import { FunctionJp, Loop } from "@specs-feup/clava/api/Joinpoints.js";
import { AHoopaStage } from "../AHoopaStage.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { EtgLogger } from "@specs-feup/extended-task-graph/EtgLogger";

export class InstrumentationInserter {
    private logger: EtgLogger;
    private outputDir: string;

    constructor(outputDir: string, appName: string) {
        this.logger = new EtgLogger("InstrumentationInserter", outputDir, appName, "Hoopa");
        this.outputDir = outputDir;
    }

    public instrumentLoops(fun: FunctionJp): number {
        this.logger.log(`Instrumenting loops in function ${fun.name}`);
        let loopCount = 0;

        for (const loop of Query.searchFrom(fun, Loop)) {
            this.logger.log(` Instrumenting loop at ${fun.name}:${loop.line}`);

            const loopCounterName = IdGenerator.next("_loop_cntr_")
            const loopCounterDecl = ClavaJoinPoints.varDecl(loopCounterName, ClavaJoinPoints.integerLiteral(0));
            const declStmt = ClavaJoinPoints.declStmt(loopCounterDecl);
            loop.insertBefore(declStmt);

            const incrementExpr = ClavaJoinPoints.unaryOp("++", loopCounterDecl.varref());
            const incrementStmt = ClavaJoinPoints.exprStmt(incrementExpr);
            loop.body.insertBegin(incrementStmt);

            loopCount++;
        }
        return loopCount;
    }

    public instrumentMallocs(): number {
        return 0;
    }

}