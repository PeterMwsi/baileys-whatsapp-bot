const fs = require("fs");
const path = require("path");
const { LOG_FILE } = require("./config");

fs.mkdirSync(path.dirname(LOG_FILE), {
    recursive: true
});

function logEvent(message) {

    const line =
        `[${new Date().toISOString()}] ${message}`;

    console.log(line);

    fs.appendFileSync(
        LOG_FILE,
        line + "\n"
    );

}

module.exports = {
    logEvent
};
