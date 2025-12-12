import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import { FunctionJp, Loop, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class HlsDeadCodeEliminator extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("HlsDeadCodeEliminator", silent);
    }

    public removeDeadLoops(topFun: FunctionJp): number {
        let removedLoops = 0;
        const chain = this.getFunctionChain(topFun);
        this.log(`Removing dead loops from function chain of ${topFun.name}:`);

        for (const func of chain) {
            const loops = Query.searchFrom(func, Loop).get();
            const deadLoops = loops.filter(loop => {
                const stmts = loop.body.stmts;
                if (stmts.length === 0) {
                    return true;
                }
                const firstChild = stmts[0];
                const isWrapper = firstChild instanceof WrapperStmt;
                const isHls = firstChild.code.toLowerCase().includes("#pragma hls loop_tripcount");
                return !(isWrapper && isHls);
            });
            deadLoops.forEach(loop => {
                try {
                    loop.detach();
                    this.log(`  Removed dead loop at ${loop.location}`);
                    removedLoops++;
                }
                catch (e) {
                    this.log(`  Failed to remove loop at ${loop.location}: ${e}`, "WARN");
                }
            });
        }
        this.log(`Total removed dead loops: ${removedLoops}`);
        return removedLoops;
    }
}