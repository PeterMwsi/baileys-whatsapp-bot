const STREAMS = {

    COMMANDS: "whatsapp:commands",

    RESPONSES: "whatsapp:responses"

};

const GROUP = "baileys";

const CONSUMER =
    process.env.CONSUMER_NAME ||
    require("os").hostname();

module.exports = {

    STREAMS,

    GROUP,

    CONSUMER

};