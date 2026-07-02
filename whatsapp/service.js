let sock = null;
let isReady = false;
let groupsCache = [];
let isConnecting = false;


const P = require("pino");

const qrcode = require("qrcode-terminal");

const {

    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion

} = require("@whiskeysockets/baileys");

const {

    usePostgresAuthState

} = require("../postgresAuthState");

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function setSocket(socket) {
    sock = socket;
}

function setReady(ready) {
    isReady = ready;
}

function setGroups(groups) {
    groupsCache = groups;
}

function getGroups() {
    return groupsCache;
}

function getSocket() {
    return sock;
}

function isWhatsAppReady() {
    return isReady;
}

async function waitUntilReady(timeout = 60000) {

    log("waitUntilReady started");

    const start = Date.now();

    while (Date.now() - start < timeout) {

        if (isReady && sock) {

            log("WhatsApp considered ready");
            return true;

        }

        await new Promise(resolve => setTimeout(resolve, 1000));

    }

    throw new Error("WhatsApp not ready");

}

async function refreshGroups() {

    await waitUntilReady();

    const chats = await sock.groupFetchAllParticipating();

    groupsCache = Object.values(chats);

    log(`Reloaded ${groupsCache.length} groups`);

    return groupsCache;

}

async function findGroup(search) {

    console.log(">>> NEW findGroup() is running");

    await waitUntilReady();

    search = search.toLowerCase().trim();

    let matches = groupsCache
        .filter(group =>
            group.subject &&
            group.subject.toLowerCase().includes(search)
        )
        .map(group => ({
            id: group.id,
            name: group.subject,
            participantsCount: group.participants
                ? Object.keys(group.participants).length
                : 0
        }));

    //console.log("Matches after cache:", matches);

    if (matches.length === 0) {

        await refreshGroups();

        matches = groupsCache
            .filter(group =>
                group.subject &&
                group.subject.toLowerCase().includes(search)
            )
            .map(group => ({
                id: group.id,
                name: group.subject,
                participantsCount: group.participants
                    ? Object.keys(group.participants).length
                    : 0
            }));

        console.log("Matches after refresh:", matches);

    }

    const response = {
        success: matches.length > 0,
        message: matches.length > 0
            ? `${matches.length} group(s) found`
            : "No groups found",
        groups: matches
    };

    console.log("Returning response:");
    //console.dir(response, { depth: null });

    return response;

}
async function sendMessage(phone, message) {

    await waitUntilReady();

    let cleanPhone = phone.replace(/\D/g, "");

    if (cleanPhone.startsWith("0")) {

        cleanPhone = "254" + cleanPhone.substring(1);

    }

    const jid = `${cleanPhone}@s.whatsapp.net`;

    const response = await sock.sendMessage(

        jid,

        {
            text: message
        }

    );

    log(`Message sent to ${phone}`);

    return {

        success: true,

        phone,

        messageId: response.key.id

    };

}

async function sendGroupMessage(groupId, message) {

    await waitUntilReady();

    const response = await sock.sendMessage(

        groupId,

        {

            text: message

        }

    );

    log(`Message sent to group ${groupId}`);

    return {

        success: true,

        groupId,

        messageId: response.key.id

    };

}


async function startWhatsApp() {

    if (isConnecting) {
        return;
    }

    isConnecting = true;

    try {

        const {
            state,
            saveCreds
        } = await usePostgresAuthState();

        const { version } =
           await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            logger: P({ level: "silent" }),
            browser: [
                "AutoChanga",
                "Chrome",
                "1.0"
            ]
        });

        setSocket(sock);

        sock.ev.on("creds.update", saveCreds);  

       sock.ev.on("connection.update", async (update) => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {

                log("==================================");
                log("SCAN THIS QR");
                log("==================================");

                qrcode.generate(qr, {
                    small: true
                });

            }

            if (connection === "connecting") {

                log("Connecting to WhatsApp...");

            }

            

                        
            if (connection === "open") {

                log("WhatsApp Connected");

                setReady(true);

                try {

                    const chats =
                        await sock.groupFetchAllParticipating();

                    const groups =
                        Object.values(chats);

                    setGroups(groups);

                    log(`Loaded ${groups.length} groups`);

                }
                catch (e) {

                    log(`Failed loading groups: ${e.message}`);

                }

            }


            if (connection === "close") {

                setReady(false);

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode;

                console.log("lastDisconnect:");
                console.dir(lastDisconnect, { depth: null });

                console.log("Status Code:", statusCode);

                const shouldReconnect =
                    statusCode !== DisconnectReason.loggedOut;

                log(
                    `Disconnected. Reconnect = ${shouldReconnect}`
                );

                if (shouldReconnect) {

                    setTimeout(() => {

                        startWhatsApp();

                    }, 3000);

                }

            }

        });

    } catch (err) {

        log(err.message);

        setTimeout(startWhatsApp, 5000);

    } finally {

        isConnecting = false;

    }

}

async function stopWhatsApp() {

    log("Stopping WhatsApp...");

    isReady = false;

    groupsCache = [];

    if (sock) {

        try {

            sock.ws?.close();

        } catch (e) {

            console.error(e);

        }

        setSocket(null);

    }

    log("WhatsApp stopped.");

}


module.exports = {

    setSocket,

    startWhatsApp,

    stopWhatsApp,

    setReady,

    setGroups,

    getGroups,

    waitUntilReady,

    refreshGroups,

    findGroup,

    sendMessage,

    getSocket,

    isWhatsAppReady,

    sendGroupMessage

};