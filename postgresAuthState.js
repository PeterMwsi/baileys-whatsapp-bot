const { Pool } = require("pg");
const {
    initAuthCreds,
    BufferJSON,
    proto
} = require("@whiskeysockets/baileys");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function printConnectionInfo() {

    const result = await pool.query(`
        SELECT
            current_database() AS database_name,
            current_user AS username,
            current_schema() AS schema_name
    `);

    console.log("\n=========================================");
    console.log("POSTGRES CONNECTION");
    console.log("=========================================");
    console.log(`Database : ${result.rows[0].database_name}`);
    console.log(`Username : ${result.rows[0].username}`);
    console.log(`Schema   : ${result.rows[0].schema_name}`);
    console.log("=========================================\n");

}

async function saveCreds(creds) {

    await pool.query(
        `
        INSERT INTO whatsapp_creds(id, creds, updated_at)
        VALUES($1,$2,NOW())

        ON CONFLICT(id)

        DO UPDATE SET

        creds = excluded.creds,
        updated_at = NOW()
        `,
        [
            "default",
            JSON.stringify(creds, BufferJSON.replacer)
        ]
    );

}

async function loadCreds() {

    const result = await pool.query(

        `SELECT creds FROM whatsapp_creds WHERE id='default'`

    );

    if (!result.rows.length) {

        const creds = initAuthCreds();

        await saveCreds(creds);

        return creds;

    }

    return JSON.parse(
        JSON.stringify(result.rows[0].creds),
        BufferJSON.reviver
    );

}

async function getKeys(type, ids) {

    const data = {};

    for (const id of ids) {

        const result = await pool.query(

            `
            SELECT value

            FROM whatsapp_keys

            WHERE category=$1

            AND key=$2
            `,
            [type, id]

        );

        if (result.rows.length) {

            data[id] = JSON.parse(
                JSON.stringify(result.rows[0].value),
                BufferJSON.reviver
            );

        }

    }

    return data;

}

async function setKeys(data) {

    for (const category in data) {

        for (const id in data[category]) {

            const value = data[category][id];

            if (value) {

                await pool.query(

                    `
                    INSERT INTO whatsapp_keys
                    (category,key,value)

                    VALUES($1,$2,$3)

                    ON CONFLICT(category,key)

                    DO UPDATE SET

                    value=excluded.value
                    `,
                    [
                        category,
                        id,
                        JSON.stringify(value, BufferJSON.replacer)
                    ]

                );

            } else {

                await pool.query(

                    `
                    DELETE

                    FROM whatsapp_keys

                    WHERE category=$1

                    AND key=$2
                    `,
                    [
                        category,
                        id
                    ]

                );

            }

        }

    }

}

async function usePostgresAuthState() {

    if (process.env.PRINT_SCHEMA === "true") {

        await printConnectionInfo();

    }

    const creds = await loadCreds();

    return {

        state: {

            creds,

            keys: {

                get: async(type, ids) => {

                    const data = await getKeys(type, ids);

                    const value = {};

                    for (const id in data) {

                        value[id] = data[id]
                            ? (
                                type === "app-state-sync-key"
                                    ? proto.Message.AppStateSyncKeyData.fromObject(data[id])
                                    : data[id]
                            )
                            : null;

                    }

                    return value;

                },

                set: async(data) => {

                    const lidMappings = data["lid-mapping"];

                    if (lidMappings) {

                        console.log(
                            "Saving",
                            Object.keys(lidMappings).length,
                            "new LID mappings"
                        );

                    }

                    await setKeys(data);

                }

            }

        },

        saveCreds: async() => {

            await saveCreds(creds);

        }

    };

}

module.exports = {
    usePostgresAuthState
};