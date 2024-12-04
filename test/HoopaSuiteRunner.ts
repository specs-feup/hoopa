import { SuiteRunner } from "clava-lite-benchmarks/SuiteRunner";
import { HoopaAPI } from "../src/HoopaAPI.js";

export class HoopaSuiteRunner extends SuiteRunner {
    protected getScriptName(): string {
        return "Hoopa";
    }

    protected runScript(app: string, topFunctionName: string, isCached: boolean, config: Record<string, any>): boolean {
        const hoopa = new HoopaAPI(topFunctionName, config.hoopaConfig, config.outputDir, app);
        hoopa.run(isCached);
        return true;
    }
}