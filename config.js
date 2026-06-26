require("dotenv").config();

module.exports = {

    PORT:
        parseInt(process.env.PORT || "5052"),

    SESSION_NAME:
        process.env.SESSION_NAME || "main-session",

    DATABASE_URL:
        process.env.DATABASE_URL,

    LOG_FILE:
        process.env.LOG_FILE || "logs/whatsapp.log",

    PRINT_QR:
        process.env.PRINT_QR === "true"

};
