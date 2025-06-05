import { FileJp, FunctionJp, Scope, Statement } from "@specs-feup/clava/api/Joinpoints.js";
import { ABackend } from "../ABackend.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ClusterInOut } from "@specs-feup/extended-task-graph/Cluster";

export class XrtCxxBackend extends ABackend {
    constructor(topFunctionName: string, outputDir: string, appName: string) {
        super(topFunctionName, outputDir, appName, "XRT");
    }

    protected buildBody(wrapperFun: FunctionJp, entrypoint: string, inOuts: Map<string, ClusterInOut>, debug: boolean): Scope {
        const wl = ClavaJoinPoints.stmtLiteral("");

        if (debug) {
            this.generateDebugHeader(wrapperFun);
        }
        this.addIncludes(wrapperFun);

        const stmts: Statement[] = [
            this.generateDebugInfo(debug, `Setting up XRT kernel ${entrypoint}`),
            ...this.generateXrtInit(entrypoint),
            this.wl(),

            this.generateDebugInfo(debug, "Creating CPU-FPGA buffers"),
            ...this.generateBufferObjects(wrapperFun),
            this.wl(),

            this.generateDebugInfo(debug, "Copying data into buffers"),
            ...this.generateWriteBufferSync(wrapperFun, inOuts),
            this.wl(),

            this.generateDebugInfo(debug, "Preparing kernel run"),
            ...this.generateKernelCall(wrapperFun),
            this.wl(),

            this.generateDebugInfo(debug, "Starting kernel..."),
            ClavaJoinPoints.stmtLiteral(`kernel_run.wait();`),
            this.wl(),

            this.generateDebugInfo(debug, "Copying data back from the buffers into the host"),
            ...this.generateReadBufferSync(wrapperFun, inOuts)
        ];

        const body = ClavaJoinPoints.scope(...stmts);
        return body;
    }

    private wl(): Statement {
        return ClavaJoinPoints.stmtLiteral("");
    }

    private generateDebugHeader(wrapperFun: FunctionJp) {
        const timestamp = `
const auto program_start_time = std::chrono::steady_clock::now();

std::ostream &timestamp(std::ostream &os)
{
    auto now = std::chrono::steady_clock::now();
    double elapsed_seconds = std::chrono::duration<double>(now - program_start_time).count();

    os << "[" << std::setw(8) << std::fixed << std::setprecision(3) << elapsed_seconds << "] ";
    return os;
}
        `;
        const timestampStmts = ClavaJoinPoints.stmtLiteral(timestamp);
        wrapperFun.insertBefore(timestampStmts);

        const file = wrapperFun.getAncestor("file") as FileJp;
        file.addInclude("chrono", true);
        file.addInclude("iomanip", true);
        file.addInclude("iostream", true);
        file.addInclude("thread", true);
        file.addInclude("cstring", true);
    }

    private generateDebugInfo(debug: boolean, msg: string): Statement {
        if (debug) {
            return ClavaJoinPoints.stmtLiteral(`std::cout << timestamp << "${msg}" << std::endl;`);
        }
        else {
            return ClavaJoinPoints.stmtLiteral(``);
        }
    }

    private addIncludes(wrapperFun: FunctionJp) {
        const file = wrapperFun.getAncestor("file") as FileJp;
        file.addInclude("experimental/xrt_bo.h");
        file.addInclude("experimental/xrt_device.h");
        file.addInclude("experimental/xrt_kernel.h");
    }

    private generateXrtInit(entrypoint: string): Statement[] {
        const stmts: Statement[] = [
            ClavaJoinPoints.stmtLiteral(`auto device = xrt::device(0);`),
            ClavaJoinPoints.stmtLiteral(`auto uuid = device.load_xclbin("./cluster.xclbin");`),
            ClavaJoinPoints.stmtLiteral(`auto kernel = xrt::kernel(device, uuid, "${entrypoint}");`)
        ];
        return stmts;
    }

    private generateBufferObjects(wrapperFun: FunctionJp): Statement[] {
        const stmts: Statement[] = [];
        const params = wrapperFun.params;

        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            if (param.type.isArray) {
                const name = param.name;
                const bufferName = `bo_${name}`;

                const datatype = param.type.code.split("[")[0];
                const size = param.type.arraySize;
                const bufferSize = `${size} * sizeof(${datatype})`;

                const groupId = `kernel.group_id(${i})`;
                const stmtCode = `auto ${bufferName} = xrt::bo(device, ${bufferSize}, ${groupId});`
                const stmt = ClavaJoinPoints.stmtLiteral(stmtCode);
                stmts.push(stmt);
            }
        }
        return stmts;
    }

    private generateWriteBufferSync(wrapperFun: FunctionJp, inOuts: Map<string, ClusterInOut>): Statement[] {
        const stmts: Statement[] = [];

        for (const param of wrapperFun.params) {
            if (param.type.isArray) {
                const name = param.name;

                if (inOuts.has(name) && inOuts.get(name) == ClusterInOut.WRITE) {
                    continue;
                }
                const bufferName = `bo_${name}`;

                const bufferStmts = [
                    ClavaJoinPoints.stmtLiteral(`${bufferName}.write(${name});`),
                    ClavaJoinPoints.stmtLiteral(`${bufferName}.sync(XCL_BO_SYNC_BO_TO_DEVICE);`),
                    this.wl()
                ]
                stmts.push(...bufferStmts);
            }
        }
        return stmts.slice(0, stmts.length - 1);
    }

    private generateKernelCall(wrapperFun: FunctionJp): Statement[] {
        const stmts: Statement[] = [
            ClavaJoinPoints.stmtLiteral(`auto kernel_run = xrt::run(kernel);`)
        ];

        for (let i = 0; i < wrapperFun.params.length; i++) {
            const param = wrapperFun.params[i];

            if (param.type.isArray) {
                const argStmt = ClavaJoinPoints.stmtLiteral(`kernel_run.set_arg(${i}, bo_${param.name});`);
                stmts.push(argStmt);
            }
            else {
                const argStmt = ClavaJoinPoints.stmtLiteral(`kernel_run.set_arg(${i}, ${param.name});`);
                stmts.push(argStmt);
            }
        }
        stmts.push(ClavaJoinPoints.stmtLiteral(`kernel_run.start();`));
        return stmts;
    }

    private generateReadBufferSync(wrapperFun: FunctionJp, inOuts: Map<string, ClusterInOut>): Statement[] {
        const stmts: Statement[] = [];

        for (const param of wrapperFun.params) {
            if (param.type.isArray) {
                const name = param.name;

                if (inOuts.has(name) && inOuts.get(name) == ClusterInOut.READ) {
                    continue;
                }
                const bufferName = `bo_${name}`;

                const bufferStmts = [
                    ClavaJoinPoints.stmtLiteral(`${bufferName}.sync(XCL_BO_SYNC_BO_FROM_DEVICE);`),
                    ClavaJoinPoints.stmtLiteral(`${bufferName}.read(${name});`)
                ]
                stmts.push(...bufferStmts);
            }
        }
        return stmts;
    }
}