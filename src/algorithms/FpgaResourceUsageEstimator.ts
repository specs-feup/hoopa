import { VitisImplReport, VitisSynReport } from "@specs-feup/clava-vitis-integration/VitisReports";

export class FpgaResourceUsageEstimator {
    public static readonly DEFAULT_WEIGHTS: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0];

    public static estimateUsage(report: VitisSynReport | VitisImplReport, weights: [number, number, number, number] = this.DEFAULT_WEIGHTS): number {
        const usages = [report.perLUT, report.perFF, report.perDSP, report.perBRAM];

        const weightedSum = usages.map((usage, index) => usage * weights[index]).reduce((a, b) => a + b, 0);
        const totalWeights = weights.reduce((a, b) => a + b, 0);

        return weightedSum / totalWeights;
    }
}