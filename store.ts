export class Store {
    private data: Map<string, string>;
    private lists: Map<string, string[]>;
    private sets: Map<string, Set<string>>;

    private maxKeys: number = 10000

    constructor(maxKeys?: number) {
        this.data = new Map<string, string>();
        this.lists = new Map<string, string[]>();
        this.sets = new Map<string, Set<string>>();

        if (maxKeys) {
            this.maxKeys = maxKeys;
        }
    }



    private typeOf(key: string): "string" | "list" | "set" | null {
        if (this.data.has(key)) return "string";
        if (this.lists.has(key)) return "list";
        if (this.sets.has(key)) return "set";
        return null;
    }

    private verifyType(key: string, expectedType: "string" | "list" | "set") {
        const actualType = this.typeOf(key);
        if (actualType !== null && actualType !== expectedType) {
            throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
        }
    }

    private verifyTypeOrClear(key: string, expectedType: "string" | "list" | "set") {
        const actualType = this.typeOf(key);
        if (actualType !== null && actualType !== expectedType) {
            // For simple strings SET overwrites the existing key regardless of its type in standard Redis.
            if (expectedType === "string") {
                this.lists.delete(key);
                this.sets.delete(key);
            } else {
                throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
            }
        }
    }

    // Strings
    set(key: string, value: string): string {
        this.verifyTypeOrClear(key, "string");
        this.data.set(key, value);
        return "OK";
    }

    get(key: string): string | null {
        this.verifyType(key, "string");
        return this.data.get(key) || null;
    }

    del(keys: string[]): number {
        let count = 0;
        for (const key of keys) {
            if (this.data.delete(key) || this.lists.delete(key) || this.sets.delete(key)) {
                count++;
            }
        }
        return count;
    }

    exists(keys: string[]): number {
        let count = 0;
        for (const key of keys) {
            if (this.data.has(key) || this.lists.has(key) || this.sets.has(key)) {
                count++;
            }
        }
        return count;
    }

    incr(key: string): number {
        return this.incrBy(key, 1);
    }

    decr(key: string): number {
        return this.incrBy(key, -1);
    }

    private incrBy(key: string, increment: number): number {
        this.verifyType(key, "string");
        const val = this.data.get(key);
        if (val === undefined) {
            this.data.set(key, increment.toString());
            return increment;
        }
        const num = Number(val);
        if (isNaN(num)) {
            throw new Error("ERR value is not an integer or out of range");
        }
        const newNum = num + increment;
        this.data.set(key, newNum.toString());
        return newNum;
    }

    // Lists
    lpush(key: string, values: string[]): number {
        this.verifyType(key, "list");
        if (!this.lists.has(key)) {
            this.lists.set(key, []);
        }
        const list = this.lists.get(key)!;
        list.unshift(...values);
        return list.length;
    }

    rpush(key: string, values: string[]): number {
        this.verifyType(key, "list");
        if (!this.lists.has(key)) {
            this.lists.set(key, []);
        }
        const list = this.lists.get(key)!;
        list.push(...values);
        return list.length;
    }

    lpop(key: string): string | null {
        this.verifyType(key, "list");
        const list = this.lists.get(key);
        if (!list || list.length === 0) return null;
        const val = list.shift()!;
        if (list.length === 0) this.lists.delete(key);
        return val;
    }

    rpop(key: string): string | null {
        this.verifyType(key, "list");
        const list = this.lists.get(key);
        if (!list || list.length === 0) return null;
        const val = list.pop()!;
        if (list.length === 0) this.lists.delete(key);
        return val;
    }

    // Sets
    sadd(key: string, members: string[]): number {
        this.verifyType(key, "set");
        if (!this.sets.has(key)) {
            this.sets.set(key, new Set<string>());
        }
        const set = this.sets.get(key)!;
        let added = 0;
        for (const member of members) {
            if (!set.has(member)) {
                set.add(member);
                added++;
            }
        }
        return added;
    }

    srem(key: string, members: string[]): number {
        this.verifyType(key, "set");
        const set = this.sets.get(key);
        if (!set) return 0;
        let removed = 0;
        for (const member of members) {
            if (set.delete(member)) {
                removed++;
            }
        }
        if (set.size === 0) this.sets.delete(key);
        return removed;
    }

    smembers(key: string): string[] {
        this.verifyType(key, "set");
        const set = this.sets.get(key);
        return set ? Array.from(set) : [];
    }

}