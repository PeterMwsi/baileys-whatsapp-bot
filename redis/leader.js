const os = require("os");

const LOCK_TTL =
    parseInt(process.env.LEADER_LOCK_TTL || "30", 10);

const HEARTBEAT_INTERVAL =
    parseInt(process.env.LEADER_HEARTBEAT_INTERVAL || "10", 10);

const MONITOR_INTERVAL =
    parseInt(process.env.LEADER_MONITOR_INTERVAL || "30", 10);

class Leader {

    constructor(redis) {

        this.redis = redis;

        this.key = "baileys:leader";

        this.id = `${os.hostname()}-${process.pid}`;

        this.isLeader = false;

        this.heartbeat = null;

        this.monitor = null;

        this.onLeader = async () => {};

    }

    async acquire() {

        const result = await this.redis.set(

            this.key,

            this.id,

            {

                NX: true,

                EX: LOCK_TTL

            }

        );

        if (result === "OK") {

            this.isLeader = true;

            if (this.lastRole !== "leader") {

                console.log("");
                console.log("★★★★ THIS POD IS THE LEADER ★★★★");
                console.log("");

                this.lastRole = "leader";
            }

            this.startHeartbeat();

            await this.onLeader();

            return true;

        }

        this.isLeader = false;

        if (this.lastRole !== "follower") {

            const owner = await this.redis.get(this.key);

            console.log("");
            console.log("★★★★ FOLLOWER POD ★★★★");
            console.log(`Current leader: ${owner}`);
            console.log("");

            this.lastRole = "follower";
        }

        return false;

    }

    startHeartbeat() {

        clearInterval(this.heartbeat);

        this.heartbeat = setInterval(

            async () => {

                if (!this.isLeader)
                    return;

                try {

                    const owner =
                        await this.redis.get(this.key);

                    if (owner !== this.id) {

                        console.log("Leadership lost.");

                        this.isLeader = false;

                        clearInterval(this.heartbeat);

                        return;

                    }

                    await this.redis.expire(this.key,LOCK_TTL);
                }
                catch (err) {

                    console.error(err);

                }

            },

            HEARTBEAT_INTERVAL * 1000

        );

    }

    async startMonitoring(onLeader) {

        this.onLeader = onLeader;

        console.log(
            `Leader Config: TTL=${LOCK_TTL}s Heartbeat=${HEARTBEAT_INTERVAL}s Monitor=${MONITOR_INTERVAL}s`
        );

        // First attempt immediately
        await this.acquire();

        // Followers retry periodically
        this.monitor = setInterval(

            async () => {

                if (this.isLeader)
                    return;

                try {

                    await this.acquire();

                }
                catch (err) {

                    console.error(err);

                }

            },

            MONITOR_INTERVAL * 1000

        );

    }

    async release() {

        clearInterval(this.monitor);

        clearInterval(this.heartbeat);

        if (!this.isLeader)
            return;

        try {

            const owner =
                await this.redis.get(this.key);

            if (owner === this.id) {

                await this.redis.del(this.key);

                console.log("Leader lock released.");

            }

        }
        catch (err) {

            console.error(err);

        }

        this.isLeader = false;

    }

}

module.exports = Leader;