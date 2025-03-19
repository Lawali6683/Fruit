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
    if (origin !== "https://agrofruit.pages.dev") {
        return res.status(403).json({ error: "Forbidden" });
    }

    // Binciken API Key domin hana unauthorized access
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    // Processing request
    try {
        const { email, bonusAmount } = req.body;

        if (!email || !bonusAmount) {
            return res.status(400).json({ error: "Invalid request data" });
        }

        const ref = db.ref("users");
        const snapshot = await ref.orderByChild("email").equalTo(email).once("value");
        const users = snapshot.val();

        if (!users) {
            return res.status(404).json({ error: "User not found" });
        }

        const userKey = Object.keys(users)[0];
        const user = users[userKey];
        const currentBalance = user.userBalance || 0;

        // Updating user balance
        await ref.child(userKey).update({ userBalance: currentBalance + bonusAmount });

        res.status(200).json({ message: "Bonus added successfully" });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};