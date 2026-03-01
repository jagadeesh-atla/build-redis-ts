import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { decode, encodeCommand } from "./resp-protocol/codec";
import { RESP, type Resp } from "./resp-protocol/parser";
import type { Subprocess } from "bun";

describe("Redis Basic Commands", () => {
    let serverProcess: Subprocess;
    let socket: any;
    let received: Buffer = Buffer.alloc(0);

    const sendCmd = async (...args: string[]): Promise<any> => {
        received = Buffer.alloc(0);
        const rawCmd = encodeCommand(args);
        socket.write(rawCmd);
        while (received.length === 0) {
            await Bun.sleep(10);
        }
        const strBuf = received.toString();
        const resResp = RESP.run(strBuf).result as Resp;
        return decode(resResp);
    };

    beforeAll(async () => {
        console.log("[test] spinning the server...");
        serverProcess = Bun.spawn(["bun", "run", "server.ts"]);
        await Bun.sleep(500);

        let isConnected = false;
        socket = await Bun.connect({
            hostname: "0.0.0.0",
            port: 1234,
            socket: {
                data(_socket, data) {
                    received = Buffer.concat([received, Buffer.isBuffer(data) ? data : Buffer.from(data)]);
                },
                open() { isConnected = true; },
                error(_socket, error) { console.error("Test Socket error:", error); }
            },
        });

        while (!isConnected) { await Bun.sleep(10); }
    });

    afterAll(() => {
        if (socket) {
            socket.end();
        }
        serverProcess.kill();
    });

    test("PING command", async () => {
        const res = await sendCmd("PING");
        expect(res).toBe("PONG");
    });

    test("SET and GET commands", async () => {
        let res = await sendCmd("SET", "mykey", "hello");
        expect(res).toBe("OK");

        res = await sendCmd("GET", "mykey");
        expect(res).toBe("hello");
    });

    test("INCR and DECR commands", async () => {
        let res = await sendCmd("INCR", "counter");
        expect(res).toBe(1);
        res = await sendCmd("INCR", "counter");
        expect(res).toBe(2);
        res = await sendCmd("DECR", "counter");
        expect(res).toBe(1);
    });

    test("EXISTS command", async () => {
        await sendCmd("SET", "existKey1", "val1");
        await sendCmd("SET", "existKey2", "val2");
        let res = await sendCmd("EXISTS", "existKey1", "existKey2", "missingKey");
        expect(res).toBe(2);
    });

    test("DEL command", async () => {
        await sendCmd("SET", "delKey1", "val1");
        let res = await sendCmd("DEL", "delKey1", "missingKey");
        expect(res).toBe(1);
        res = await sendCmd("EXISTS", "delKey1");
        expect(res).toBe(0);
    });

    test("LPUSH and LPOP commands", async () => {
        await sendCmd("DEL", "mylist_l");
        let res = await sendCmd("LPUSH", "mylist_l", "world");
        expect(res).toBe(1);
        res = await sendCmd("LPUSH", "mylist_l", "hello");
        expect(res).toBe(2);

        res = await sendCmd("LPOP", "mylist_l");
        expect(res).toBe("hello");
    });

    test("RPUSH and RPOP commands", async () => {
        await sendCmd("DEL", "mylist_r");
        let res = await sendCmd("RPUSH", "mylist_r", "hello");
        expect(res).toBe(1);
        res = await sendCmd("RPUSH", "mylist_r", "world");
        expect(res).toBe(2);

        res = await sendCmd("RPOP", "mylist_r");
        expect(res).toBe("world");
    });

    test("SADD, SMEMBERS, SREM commands", async () => {
        await sendCmd("DEL", "myset");
        let res = await sendCmd("SADD", "myset", "apple", "banana", "apple");
        expect(res).toBe(2);

        res = await sendCmd("SMEMBERS", "myset");
        expect((res as string[]).sort()).toEqual(["apple", "banana"].sort());

        res = await sendCmd("SREM", "myset", "banana", "orange");
        expect(res).toBe(1);

        res = await sendCmd("SMEMBERS", "myset");
        expect((res as string[]).sort()).toEqual(["apple"].sort());
    });
});
