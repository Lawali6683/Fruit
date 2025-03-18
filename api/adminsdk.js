const admin = require("firebase-admin");
const crypto = require("crypto");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
        databaseURL: FIREBASE_DATABASE_URL,
    });
}

const db = admin.database();

module.exports = async (req, res) => {
    // Izinin CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    // Handling OPTIONS request (CORS Preflight)
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // Binciken Origin domin hana CORS attack
    const origin = req.headers.origin;
    if (origin !== "https://agro-fruit-enterprises.vercel.app") {
        return res.status(403).json({ error: "Forbidden" });
    }

    // Binciken API Key domin hana unauthorized access
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    // Processing request
    try {
        const ref = db.ref("users");
        const snapshot = await ref.once("value");
        const usersData = snapshot.val();
        
        if (!usersData) {
            return res.status(404).json({ error: "No users found" });
        }

        res.status(200).json(usersData);
    } catch (error) {
        console.error("Error reading from Firebase:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};