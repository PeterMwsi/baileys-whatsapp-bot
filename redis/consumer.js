const {
    client,
    consumerClient
} = require("./client");

const {
    processCommand
} = require("../whatsapp/handlers");

const {
    STREAMS,
    GROUP,
    CONSUMER
} = require("./streams");

async function publishResponse(command, response, success = true) {

    await client.xAdd(
        STREAMS.RESPONSES,
        "*",
        {
            response: JSON.stringify({
                requestId: command.requestId,
                success,
                result: response
            })
        }
    );

}

async function publishError(command, err) {

    await client.xAdd(
        STREAMS.RESPONSES,
        "*",
        {
            response: JSON.stringify({
                requestId: command.requestId,
                success: false,
                error: err.message
            })
        }
    );

}

async function startConsumer() {

    console.log("Starting Redis Stream consumer...");

    while (true) {

        try {

            const result = await consumerClient.xReadGroup(

                GROUP,

                CONSUMER,

                [
                    {
                        key: STREAMS.COMMANDS,
                        id: ">"
                    }
                ],

                {
                    BLOCK: 0,
                    COUNT: 1
                }

            );

            if (!result)
                continue;

            for (const stream of result) {

                for (const message of stream.messages) {

                    console.log("=================================");
                    console.log("Received Stream Message");
                    console.log("ID:", message.id);

                    try {

                        const command =
                            JSON.parse(message.message.command);

                        console.log(command);

                        const response =
                            await processCommand(command);

                        console.log("Handler Result:");
                        console.log(response);

                        // Only synchronous commands need a response
                        if (
                            command.command === "find-group" ||
                            command.command === "ping"
                        ) {

                            await publishResponse(
                                command,
                                response
                            );

                            console.log(
                                "Response published."
                            );

                        }

                        await client.xAck(

                            STREAMS.COMMANDS,

                            GROUP,

                            message.id

                        );

                        console.log("ACK:", message.id);
                        console.log("=================================");

                    }
                    catch (err) {

                        console.error(
                            "Command Failed:",
                            err
                        );

                        try {

                            const command =
                                JSON.parse(message.message.command);

                            if (
                                command.command === "find-group" ||
                                command.command === "ping"
                            ) {

                                await publishError(
                                    command,
                                    err
                                );

                            }

                        }
                        catch (e) {
                            console.error(e);
                        }

                        // Don't ACK.
                        // Message stays pending.

                    }

                }

            }

        }
        catch (err) {

            console.error(
                "Consumer Error:",
                err
            );

            await new Promise(resolve =>
                setTimeout(resolve, 5000)
            );

        }

    }

}

module.exports = {
    startConsumer
};