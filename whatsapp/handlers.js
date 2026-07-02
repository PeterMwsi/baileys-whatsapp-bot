const {

    sendMessage,

    sendGroupMessage,

    findGroup

} = require("./service");

async function processCommand(command) {

    switch (command.command) {

        case "ping":

            console.log("Received PING");

            return {

                success: true,

                message: "PONG"

            };

        case "send":

            return await sendMessage(

                command.payload.phone,

                command.payload.message

            );

        case "send-group":

            return await sendGroupMessage(

                command.payload.groupId,

                command.payload.message

            );

        case "find-group":

            return await findGroup(
                command.payload.search
            );

        default:

            throw new Error(

                `Unknown command: ${command.command}`

            );

    }

}

module.exports = {

    processCommand

};