require("dotenv").config();

const AsyncLock = require("async-lock");
const { Pool } = require("pg");

const { proto } = require("@whiskeysockets/baileys/WAProto");
const {
    initAuthCreds
} = require("@whiskeysockets/baileys/lib/Utils/auth-utils");

const {
    BufferJSON
} = require("@whiskeysockets/baileys/lib/Utils/generics");

const SESSION_NAME =
    process.env.SESSION_NAME || "main-session";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const lock = new AsyncLock({
    maxPending: Infinity
});

async function initialiseDatabase() {

    await pool.query(`

        CREATE TABLE IF NOT EXISTS whatsapp_sessions (

            session_name TEXT NOT NULL,

            auth_key TEXT NOT NULL,

            auth_value JSONB NOT NULL,

            updated_at TIMESTAMPTZ DEFAULT NOW(),

            PRIMARY KEY(session_name, auth_key)

        )

    `);

}

async function writeData(data, key) {

    await lock.acquire(key, async () => {

        await pool.query(

            `

            INSERT INTO whatsapp_sessions
            (

                session_name,
                auth_key,
                auth_value,
                updated_at

            )

            VALUES
            (

                $1,
                $2,
                $3,
                NOW()

            )

            ON CONFLICT(session_name,auth_key)

            DO UPDATE SET

                auth_value = EXCLUDED.auth_value,

                updated_at = NOW()

            `,

            [

                SESSION_NAME,

                key,

                JSON.stringify(data, BufferJSON.replacer)

            ]

        );

    });

}

async function readData(key) {

    return lock.acquire(key, async () => {

        const result = await pool.query(

            `

            SELECT auth_value

            FROM whatsapp_sessions

            WHERE session_name=$1

            AND auth_key=$2

            `,

            [

                SESSION_NAME,

                key

            ]

        );

        if (!result.rows.length)
            return null;

        return JSON.parse(

            JSON.stringify(result.rows[0].auth_value),

            BufferJSON.reviver

        );

    });

}

async function removeData(key) {

    await lock.acquire(key, async () => {

        await pool.query(

            `

            DELETE

            FROM whatsapp_sessions

            WHERE session_name=$1

            AND auth_key=$2

            `,

            [

                SESSION_NAME,

                key

            ]

        );

    });

}

async function usePostgresAuthState() {

    await initialiseDatabase();

    const creds =
        await readData("creds") ||
        initAuthCreds();

    return {

        state: {

            creds,

            keys: {

                get: async (type, ids) => {

                    const data = {};

                    await Promise.all(

                        ids.map(async id => {

                            let value =
                                await readData(
                                    `${type}-${id}`
                                );

                            if (

                                type === "app-state-sync-key"

                                &&

                                value

                            ) {

                                value =
                                    proto.Message
                                        .AppStateSyncKeyData
                                        .fromObject(value);

                            }

                            data[id] = value;

                        })

                    );

                    return data;

                },

                set: async data => {

                    const tasks = [];

                    for (const category in data) {

                        for (const id in data[category]) {

                            const value =
                                data[category][id];

                            const key =
                                `${category}-${id}`;

                            tasks.push(

                                value

                                    ?

                                    writeData(
                                        value,
                                        key
                                    )

                                    :

                                    removeData(
                                        key
                                    )

                            );

                        }

                    }

                    await Promise.all(tasks);

                }

            }

        },

        saveCreds: async () => {

            await writeData(
                creds,
                "creds"
            );

        }

    };

}

async function clearSession() {

    await pool.query(

        `

        DELETE

        FROM whatsapp_sessions

        WHERE session_name=$1

        `,

        [

            SESSION_NAME

        ]

    );

}

module.exports = {

    usePostgresAuthState,

    clearSession

};
