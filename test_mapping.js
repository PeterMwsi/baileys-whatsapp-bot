const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode-terminal");

let reconnecting = false;

async function start() {

    console.clear();

    console.log("========================================");
    console.log(" Baileys V7 Mapping Test");
    console.log(" Node:", process.version);
    console.log("========================================");

    const { state, saveCreds } =
        await useMultiFileAuthState("./auth_info");

    const { version } =
        await fetchLatestBaileysVersion();

    console.log("WA Version:", version);

    const sock = makeWASocket({

        version,

        auth: state,

        logger: P({
            level: "silent"
        }),

        browser: [
            "Ubuntu",
            "Chrome",
            "1.0"
        ]

    });

    sock.ev.on("creds.update", async () => {

        console.log("Saving credentials...");

        await saveCreds();

        console.log("Credentials saved.");

    });

    sock.ev.on("connection.update", async (update) => {

        const {
            connection,
            qr,
            lastDisconnect
        } = update;

        if (qr) {

            console.log("\n====================================");
            console.log("SCAN THIS QR");
            console.log("====================================\n");

            qrcode.generate(qr, {
                small: true
            });

        }

        if (connection === "connecting") {

            console.log("Connecting...");

        }

        if (connection === "open") {

            console.log("\n====================================");
            console.log("CONNECTED");
            console.log("====================================\n");

            console.dir(sock.user, {
                depth: null
            });

            console.log("\nSignal Repository\n");

            console.dir(sock.signalRepository, {
                depth: 3
            });

            console.log("\nOwn Properties\n");

            console.log(
                Object.getOwnPropertyNames(
                    sock.signalRepository
                )
            );

            console.log("\nPrototype\n");

            console.log(
                Object.getOwnPropertyNames(
                    Object.getPrototypeOf(
                        sock.signalRepository
                    )
                )
            );

            console.log("\nDone.");

            console.log("\n========================");
            console.log("TEST 1 - PN -> LID");
            console.log("========================");

            const lid = await sock.signalRepository.lidMapping.getLIDForPN(
                "254712648940@s.whatsapp.net"
            );

            console.log("LID =", lid);

            console.log("\n========================");
            console.log("TEST 2 - LID -> PN");
            console.log("========================");

            const pn = await sock.signalRepository.lidMapping.getPNForLID(
                lid
            );

            console.log("PN =", pn);

            console.log("\n========================");
            console.log("LID MAPPING TEST");
            console.log("========================");

            const lidStore = sock.signalRepository.lidMapping;

            console.log("Methods:");

            console.log(
                Object.getOwnPropertyNames(
                    Object.getPrototypeOf(lidStore)
                )
            );

            console.dir(lidStore, {
                depth: 2
            });

            return;

        }

        if (connection === "close") {

            console.log("\n====================================");
            console.log("CONNECTION CLOSED");
            console.log("====================================");

            console.dir(lastDisconnect, {
                depth: null
            });

            const status =
                lastDisconnect?.error?.output?.statusCode;

            console.log("Status:", status);

            if (
                status === 515 &&
                !reconnecting
            ) {

                reconnecting = true;

                console.log(
                    "\nExpected restart after pairing..."
                );

                setTimeout(async () => {

                    reconnecting = false;

                    await start();

                }, 2000);

                return;

            }

            if (
                status === DisconnectReason.loggedOut
            ) {

                console.log(
                    "Logged out."
                );

                process.exit(0);

            }

        }

    });

}

start().catch(console.error);