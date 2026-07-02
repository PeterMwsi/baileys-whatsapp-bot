require("dotenv").config();

const originalInfo = console.info;

console.info = (...args) => {

    if (
        typeof args[0] === "string" &&
        args[0].startsWith("Closing session:")
    ) {
        return;
    }

    originalInfo(...args);

};

const express = require("express");
const cors = require("cors");

const {
    initRedis,
    createConsumerGroup,
    client
} = require("./redis/client");
const { STREAMS } = require("./redis/streams");
const crypto = require("crypto");
const { startConsumer } = require("./redis/consumer");
const Leader = require("./redis/leader");

const {

    startWhatsApp,
    stopWhatsApp,

    waitUntilReady,

    sendMessage,
    sendGroupMessage,
    findGroup,

    getGroups,
    getSocket,
    isWhatsAppReady

} = require("./whatsapp/service");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_PORT || 5552;

let leader = null;



function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

//----------------------------------------------------------
// Helpers
//----------------------------------------------------------

function getGroupByName(search) {

    if (!search) {
        return null;
    }

    search = search.toLowerCase().trim();

    return groupsCache.find(g =>
        g.subject &&
        g.subject.toLowerCase().includes(search)
    );

}


//----------------------------------------------------------
// Health
//----------------------------------------------------------

app.get("/health", (req, res) => {

    res.json({

        success: true,
        connected: isWhatsAppReady(),
        groups: getGroups().length,
        uptime: process.uptime()

    });

});

app.get("/ready", (req, res) => {

    res.json({

        ready: isWhatsAppReady()

    });

});


//...................................................................................................

app.post("/redis-send", async (req, res) => {

    try {

        const {

            phone,

            message

        } = req.body;

        const command = {

            requestId: crypto.randomUUID(),

            command: "send",

            payload: {

                phone,

                message

            },

            createdAt: new Date().toISOString()

        };

        const id = await client.xAdd(

            STREAMS.COMMANDS,

            "*",

            {

                command: JSON.stringify(command)

            }

        );

        res.json({

            success: true,

            streamId: id

        });

    }
    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

});

//......................................................................................................

//----------------------------------------------------------
// Groups
//----------------------------------------------------------

app.get("/groups", async (req, res) => {

    try {

        await waitUntilReady();

        const groups = getGroups().map(g => ({

            id: g.id,
            name: g.subject

        }));

        res.json(groups);

    } catch (err) {

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

app.post("/find-group", async (req, res) => {

    try {

        await waitUntilReady();

        let { search, phone } = req.body;

        if (!search || !phone) {
            return res.status(400).json({
                success: false,
                message: "search and phone are required"
            });
        }

        // Normalize phone
        phone = phone.replace(/\D/g, "");

        if (phone.startsWith("0")) {
            phone = "254" + phone.substring(1);
        }

        // Find first group matching the search
        let groups = getGroups().filter(g =>
            g.subject &&
            g.subject.toLowerCase().includes(search.toLowerCase())
        );

        if (groups.length === 0) {

            log(`Group "${search}" not in cache. Refreshing groups...`);

            const sock = getSocket();

            const chats =
                await sock.groupFetchAllParticipating();

            const refreshedGroups =
                Object.values(chats);

            setGroups(refreshedGroups);

            groups = refreshedGroups.filter(g =>
                g.subject &&
                g.subject.toLowerCase().includes(search.toLowerCase())
            );

        }

        if (groups.length === 0) {

            log(`Search "${search}" -> Group not found`);

            return res.json({

            success: false,

            message: "0 group(s) found",

            groups: []

        });

        }

        log(
            `Search "${search}" -> Found ${groups.length} matching group(s)`
        );

        // Convert phone number to LID
        const sock = getSocket();
        const lid =
            await sock.signalRepository.lidMapping.getLIDForPN(
                `${phone}@s.whatsapp.net`
            );

        if (!lid) {

            log(`Could not resolve ${phone} to a WhatsApp LID`);

            return res.json({

                success: false,
                message: "0 group(s) found",
                groups: []

            });

        }

       log(`Resolved ${phone} -> ${lid}`);

        

        if (!lid) {

            return res.json({

                success: false,
                message: "0 group(s) found",
                groups: []

            });

            }

        log(
            `Resolved ${phone} -> ${lid}`
        );

        // Check every matching group
        const result = [];

        for (const group of groups) {

            const sock = getSocket();

            const metadata =
                await sock.groupMetadata(group.id);

            console.log("======================");
            console.log("Group:", group.subject);
            console.log("Resolved LID:", lid);
            console.log("Participants:");

           // for (const p of metadata.participants) {
           //     console.log(p.id);
            //}

            console.log("======================");

            const found =
                metadata.participants.some(
                    participant => participant.id === lid
                );

            if (found) {

                log(
                    `${phone} IS a member of ${group.subject}`
                );

                result.push({

                    id: group.id,
                    name: group.subject,
                    participantsCount:
                        metadata.participants.length

                });

            } else {

                log(`${phone} is NOT a member of ${group.subject}`);

            }

        }

        // Return AFTER checking all groups
        return res.json({

            success: result.length > 0,

            message: `${result.length} group(s) found`,

            groups: result

        });

            } catch (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: err.message
                });

            }

        });

//----------------------------------------------------------
// Send Individual Message
//----------------------------------------------------------

//----------------------------------------------------------
// Send Individual Message
//----------------------------------------------------------

app.post("/send", async (req, res) => {

    try {

        const {

            phone,

            message

        } = req.body;

        if (!phone || !message) {

            return res.status(400).json({

                success: false,

                message: "phone and message are required"

            });

        }

        const result = await sendMessage(

            phone,

            message

        );

        res.json(result);

    }

    catch (err) {

        log(err.message);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

});

//----------------------------------------------------------
// Send Group Message
//----------------------------------------------------------

app.post("/send-group", async (req, res) => {

    try {

        const {

            groupId,

            message

        } = req.body;

        if (!groupId || !message) {

            return res.status(400).json({

                success: false,

                message: "groupId and message are required"

            });

        }

        const result = await sendGroupMessage(

            groupId,

            message

        );

        res.json(result);

    }

    catch (err) {

        log(err.message);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

});


//----------------------------------------------------------
// Refresh Groups
//----------------------------------------------------------

app.post("/refresh-groups", async (req, res) => {

    try {

        await waitUntilReady();

        const sock = getSocket();

        const chats =
            await sock.groupFetchAllParticipating();

        const groups =
            Object.values(chats);

        setGroups(groups);

        log(`Reloaded ${groups.length} groups`);

        res.json({

            success: true,
            groups: getGroups().length

        });

    } catch (err) {

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//----------------------------------------------------------
// Start Server
//----------------------------------------------------------

async function start() {

    await initRedis();

    await createConsumerGroup();

    leader = new Leader(client);

    await leader.startMonitoring(async () => {

        log("Starting Redis consumer...");

        startConsumer();

        log("Starting WhatsApp because this pod became leader.");

        await startWhatsApp();

    });

    log("Leader monitoring started.");

    app.listen(PORT, () => {

        log("========================================");
        log("AutoChanga Baileys Server Started");
        log(`Listening on port ${PORT}`);
        log(`Health: http://localhost:${PORT}/health`);
        log("========================================");

    });

}

start().catch(err => {

    console.error("Startup failed:", err);

    process.exit(1);

});

process.on(

    "SIGTERM",

    async () => {

        log("SIGTERM received.");

        await stopWhatsApp();

        if (leader) {

            await leader.release();

        }

        process.exit(0);

    }

);

process.on(

    "SIGINT",

    async () => {

        log("SIGINT received.");

        await stopWhatsApp();

        if (leader) {

            await leader.release();

        }

        process.exit(0);

    }

);