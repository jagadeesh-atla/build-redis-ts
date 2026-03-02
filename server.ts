import { createServer, Socket } from "net";
import { RESP, type Resp } from "./resp-protocol/parser";
import { decode, encode } from "./resp-protocol/codec";
import { Store } from "./store";
import { AOF } from "./aof";

const PORT = 1234;
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

const store = new Store();
const aof = new AOF();

interface ClientState {
    socket: Socket;
    buffer: Buffer;
    responseQueue: Buffer[];
    isProcessing: boolean;
}

const clients = new Map<Socket, ClientState>();

const server = createServer((socket: Socket) => {
    console.log(`[server] ${socket.remoteAddress}:${socket.remotePort} connected`);

    socket.setNoDelay(true);
    socket.setKeepAlive(true);

    const client: ClientState = {
        socket: socket,
        buffer: Buffer.alloc(0),
        responseQueue: [],
        isProcessing: false,
    };

    clients.set(socket, client);

    socket.on("data", (chunk: Buffer) => handleData(client, chunk));
    socket.on("close", () => cleanupClient(socket));
    socket.on("error", (err) => {
        console.error(`[server] socket error`, err);
        cleanupClient(socket);
    });
});

server.on("error", (err) => {
    console.error("[server] fatal error:", err);
    process.exit(1);
});

aof.restore((args) => {
    executeCommand(args, null, true);
});

server.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
});

function handleData(client: ClientState, chunk: Buffer) {
    client.buffer = Buffer.concat([client.buffer, chunk]);

    if (client.buffer.length > MAX_BUFFER_SIZE) {
        console.warn("[server] buffer overflow, closing connection");
        client.socket.destroy();
        return;
    }

    processMessage(client);
}

function processMessage(client: ClientState) {
    if (client.isProcessing) return;
    client.isProcessing = true;

    while (client.buffer.length > 0) {
        const byteStrBuffer = client.buffer.toString("latin1");

        const result = RESP.run(byteStrBuffer);
        if (result.isError) break;

        const commandResp: Resp = result.result;
        const parsedLength = Buffer.byteLength(byteStrBuffer.slice(0, result.index), "latin1");
        client.buffer = client.buffer.subarray(parsedLength);

        const args = decode(commandResp);
        const response = executeCommand(args, client.socket);

        if (!(response instanceof Error)) {
            const commandName = String(args[0]).toUpperCase();
            const mutativeCommands = new Set(["SET", "DEL", "INCR", "DECR", "LPUSH", "RPUSH", "LPOP", "RPOP", "SADD", "SREM"]);
            if (mutativeCommands.has(commandName)) {
                aof.append(args);
            }
        }

        if (Array.isArray(response) && response.length > 0 && Array.isArray(response[0])) {
            for (const res of response) {
                client.responseQueue.push(Buffer.from(encode(res)));
            }
        } else {
            client.responseQueue.push(Buffer.from(encode(response)));
        }
    }

    while (client.responseQueue.length > 0) {
        const response = client.responseQueue.shift();
        if (response) {
            client.socket.write(response);
        }
    }
    client.isProcessing = false;
}

function executeCommand(args: any[], clientSocket: Socket | null, isRestore = false): any {
    if (!Array.isArray(args) || args.length === 0) {
        return new Error("ERR unknown command");
    }

    const command = String(args[0]).toUpperCase();
    console.log(command);

    try {
        switch (command) {
            case "PING":
                return args.length > 1 ? String(args[1]) : "PONG";
            case "SET":
                if (args.length < 3) return new Error("ERR wrong number of arguments for 'set' command");
                return store.set(String(args[1]), String(args[2]));
            case "GET":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'get' command");
                const val = store.get(String(args[1]));
                return val === null ? null : val;
            case "DEL":
                if (args.length < 2) return new Error("ERR wrong number of arguments for 'del' command");
                return store.del(args.slice(1).map(String));
            case "EXISTS":
                if (args.length < 2) return new Error("ERR wrong number of arguments for 'exists' command");
                return store.exists(args.slice(1).map(String));
            case "INCR":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'incr' command");
                return store.incr(String(args[1]));
            case "DECR":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'decr' command");
                return store.decr(String(args[1]));
            case "LPUSH":
                if (args.length < 3) return new Error("ERR wrong number of arguments for 'lpush' command");
                return store.lpush(String(args[1]), args.slice(2).map(String));
            case "RPUSH":
                if (args.length < 3) return new Error("ERR wrong number of arguments for 'rpush' command");
                return store.rpush(String(args[1]), args.slice(2).map(String));
            case "LPOP":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'lpop' command");
                return store.lpop(String(args[1]));
            case "RPOP":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'rpop' command");
                return store.rpop(String(args[1]));
            case "SADD":
                if (args.length < 3) return new Error("ERR wrong number of arguments for 'sadd' command");
                return store.sadd(String(args[1]), args.slice(2).map(String));
            case "SREM":
                if (args.length < 3) return new Error("ERR wrong number of arguments for 'srem' command");
                return store.srem(String(args[1]), args.slice(2).map(String));
            case "SMEMBERS":
                if (args.length !== 2) return new Error("ERR wrong number of arguments for 'smembers' command");
                return store.smembers(String(args[1]));
            default:
                return new Error(`ERR unknown command '${command}'`);
        }
    } catch (e: any) {
        return new Error(e.message);
    }
}

function cleanupClient(socket: Socket) {
    const client = clients.get(socket);
    if (!client) return;

    console.log(`[server] ${socket.remoteAddress}:${socket.remotePort} disconnected`);
    clients.delete(socket);
}
