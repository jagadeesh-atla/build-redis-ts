import { appendFileSync, readFileSync, existsSync } from "fs";
import { RESP, type Resp } from "./resp-protocol/parser";
import { decode, encodeCommand } from "./resp-protocol/codec";

export class AOF {
    private readonly filePath: string;
    constructor(filePath: string = "appendonly.aof") {
        this.filePath = filePath;
    }

    public append(args: any[]) {
        const stringArgs = args.map(String);
        const encoded = encodeCommand(stringArgs);
        appendFileSync(this.filePath, encoded, { encoding: "latin1" });
    }

    public restore(executePayload: (args: any[]) => void) {
        if (!existsSync(this.filePath)) return;

        const data = readFileSync(this.filePath);
        if (data.length === 0) return;

        let byteStrBuffer = data.toString("latin1");

        while (byteStrBuffer.length > 0) {
            const result = RESP.run(byteStrBuffer);
            if (result.isError) {
                // If there's a parsing error or incomplete data, we break
                break;
            }

            const commandResp: Resp = result.result;
            byteStrBuffer = byteStrBuffer.slice(result.index);

            const args = decode(commandResp);
            if (Array.isArray(args)) {
                executePayload(args);
            }
        }
    }
}
