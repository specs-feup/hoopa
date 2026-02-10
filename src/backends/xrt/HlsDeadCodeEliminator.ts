import { AdvancedTransform } from "@specs-feup/clava-code-transforms/AdvancedTransform";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { Call, FunctionJp, If, Loop, ParenExpr, Scope, Statement, Varref, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class HlsDeadCodeEliminator extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("HlsDeadCodeEliminator", silent);
    }

    public removeAll(topFun: FunctionJp, maxPasses: number = 1): number {
        this.log(`Starting HLS dead code elimination for function ${topFun.name}`);
        let totalRemoved = 0;
        let removedInPass: number;
        let nPasses = 0;
        const chain = this.getFunctionChain(topFun);

        do {
            this.log(`Iteration ${nPasses + 1} of dead code elimination:`);
            removedInPass = 0;
            removedInPass += this.removeDeadLoops(chain);
            removedInPass += this.removeDeadScopes(chain);
            removedInPass += this.removeDeadMemoryRegions(chain);
            totalRemoved += removedInPass;
            this.log(` Removed ${removedInPass} dead constructs in iteration ${nPasses}.`);
            this.logLine();
            nPasses++;
        } while (removedInPass > 0 && nPasses < maxPasses);

        this.log(`Finished HLS dead code elimination for function ${topFun.name}. Total removed loops: ${totalRemoved}`);
        return totalRemoved;
    }

    public removeDeadMemoryRegions(chain: FunctionJp[]): number {
        this.log(`  Removing dead memory regions from function chain of ${chain[0].name}:`);
        let totalRemoved = 0;

        for (const func of chain) {
            const scopesToRemove: Map<number, Scope> = new Map();
            const mallocs = Query.searchFrom(func, Call).get().filter(call => call.name === "malloc");
            for (const malloc of mallocs) {
                const parentStmt = malloc.getAncestor("statement") as Statement;
                const parentScope = malloc.getAncestor("scope") as Scope;
                const previousSibling = parentStmt.leftJp;

                if (previousSibling != null) {
                    if (!previousSibling.code.toLowerCase().startsWith("#pragma clava malloc_size")) {
                        scopesToRemove.set(parentScope.line, parentScope);
                    }
                }
                else {
                    scopesToRemove.set(parentScope.line, parentScope);
                }
            }
            for (const [_, scope] of scopesToRemove) {
                totalRemoved += this.detachScope(scope, func);
            }
        }
        this.log(`  Total removed dead memory regions: ${totalRemoved}`);
        return totalRemoved;
    }

    public removeDeadScopes(chain: FunctionJp[]): number {
        let removedScopes = 0;
        this.log(`  Removing dead scopes from function chain of ${chain[0].name}:`);

        for (const func of chain) {
            const scopes = Query.searchFrom(func, Scope).get();
            const deadScopes = scopes.filter(scope => scope.stmts.length === 0);

            deadScopes.forEach(scope => {
                removedScopes = this.detachScope(scope, func);
            });
        }
        this.log(`  Total removed dead scopes: ${removedScopes}`);
        return removedScopes;
    }

    private detachScope(scope: Scope, func: FunctionJp) {
        let removedScopes = 0;
        try {
            if (scope.parent instanceof Loop) {
                scope.parent.detach();
                this.log(`    Removed dead scope at ${scope.location} by removing its parent loop.`);
                removedScopes++;
            }
            else if (scope.parent instanceof FunctionJp) {
                scope.parent.detach();
                const allCalls = Query.search(Call, { name: func.name }).get();
                //scope.insertEnd(ClavaJoinPoints.stmtLiteral(`printf("${func.name}\\n");`));
                allCalls.forEach(call => {
                    call.parent.replaceWith(ClavaJoinPoints.stmtLiteral(`//${call.code}; // Dead call removed by HLS DCE`));
                    this.log(`    Removed call to dead function ${func.name} at line ${call.line}`);
                });

                removedScopes++;
            }
            else if (scope.parent instanceof If) {
                const ifStmt = scope.parent as If;
                // scope is else-scope, we can just remove it
                if (ifStmt.else != null && ifStmt.else.astId == scope.astId) {
                    const ifCond = ifStmt.cond;
                    const thenScope = ifStmt.then;
                    const newIf = ClavaJoinPoints.ifStmt(ifCond, thenScope);
                    ifStmt.replaceWith(newIf);

                    this.log(`    Removed dead else-scope at line ${scope.line}.`);
                    removedScopes++;
                }

                // scope is then-scope
                else if (ifStmt.then.astId == scope.astId) {
                    // if there is an else-scope, we can negate the condition and keep the else-scope
                    if (ifStmt.else != null && ifStmt.else.stmts.length > 0) {
                        let condExpr = ifStmt.cond;
                        const thenScope = scope;
                        const elseScope = ifStmt.else;
                        condExpr.detach();
                        thenScope.detach();
                        elseScope.detach();

                        if (!(condExpr instanceof ParenExpr) && !(condExpr instanceof Varref)) {
                            condExpr = ClavaJoinPoints.parenthesis(condExpr);
                        }
                        const negatedExpr = ClavaJoinPoints.unaryOp("!", condExpr);

                        const newIf = ClavaJoinPoints.ifStmt(negatedExpr, elseScope);
                        ifStmt.replaceWith(newIf);

                        this.log(`    Removed dead then-scope at line ${scope.line} by negating the if-condition.`);
                        removedScopes++;
                    }

                    // if there is no else-scope, we can simply remove the entire if-statement
                    else {
                        ifStmt.detach();
                        this.log(`    Removed dead then-scope at line ${scope.line} by removing the entire if-statement.`);
                        removedScopes++;
                    }
                }
                else {
                    this.logWarning(`    Unexpected scope parent for scope at line ${scope.line}.`);
                }
            }
        }
        catch (e) {
            this.logWarning(`    Failed to remove scope at line ${scope.line}: ${e}`);
        }
        return removedScopes;
    }

    public removeDeadLoops(chain: FunctionJp[]): number {
        let removedLoops = 0;
        this.log(`  Removing dead loops from function chain of ${chain[0].name}:`);

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
                    const note = ClavaJoinPoints.stmtLiteral("// Dead loop removed by HLS DCE, make sure it has the #pragma hls loop_tripcount directive even if it has static bounds\n");
                    loop.replaceWith(note);
                    this.log(`    Removed dead loop at ${loop.location}`);
                    removedLoops++;
                }
                catch (e) {
                    this.logWarning(`    Failed to remove loop at ${loop.location}: ${e}`);
                }
            });
        }
        this.log(`  Total removed dead loops: ${removedLoops}`);
        return removedLoops;
    }
}