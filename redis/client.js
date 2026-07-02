const { createClient } = require("redis");
const { STREAMS, GROUP } = require("./streams");

console.log("REDIS_URL =", process.env.REDIS_URL);
const client = createClient({
    url: process.env.REDIS_URL
});

const consumerClient = client.duplicate();

client.on("error", err => {
    console.error("Redis:", err);
});


async function initRedis() {

    if (!client.isOpen) {
        await client.connect();
    }

    if (!consumerClient.isOpen) {
        await consumerClient.connect();
    }

    console.log("Redis Connected");
}

async function createConsumerGroup() {

    try {

        await client.xGroupCreate(
            STREAMS.COMMANDS,
            GROUP,
            "0",
            {
                MKSTREAM: true
            }
        );

        console.log("Consumer group created.");

    }
    catch (err) {

        if (!err.message.includes("BUSYGROUP")) {
            throw err;
        }

        console.log("Consumer group already exists.");

    }

}

module.exports = {

    client,

    initRedis,

	consumerClient,

    createConsumerGroup

};
