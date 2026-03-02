# Redis Server in TypeScript

Redis clone for learning purposes and showcase in resume.
Zero dependencies.

## DONE

-  Raw TCP server
- RESP Protocol
  * simple strings
  * bulk strings
  * integers
  * arrays
- In-memory storage engine
- Basic Commands
  * Strings: set, get, del, exists, incr/decr
  * Lists: lpush, rpush, lpop, rpop
  * sets: sadd, srem, smembers
- Persistence (AOF)

## TODO

- TTL
  * EXPIRE
  * TTL
  * Lazy expiration
  * Active expiration (background sweep)
- Pub/Sub
- LRU Eviction
