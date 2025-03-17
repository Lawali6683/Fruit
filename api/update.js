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
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    // Handling OPTIONS request (CORS Preflight)
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // Verify Origin to prevent CORS attack
    const origin = req.headers.origin;
    if (origin !== "https://agrofruit.pages.dev") {
        return res.status(403).json({ error: "Forbidden" });
    }

    // Verify API Key to prevent unauthorized access
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    // Ensure request method is POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, dailyUpgrade, investmentTime, investment } = req.body;

    if (!email || dailyUpgrade === undefined || investmentTime === undefined || investment === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Find user by email
        const usersRef = db.ref("users");
        const snapshot = await usersRef.orderByChild("email").equalTo(email).once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "User not found" });
        }

        const updates = {};
        snapshot.forEach((childSnapshot) => {
            const userId = childSnapshot.key;
            updates[`users/${userId}/dailyUpgrade`] = dailyUpgrade;
            updates[`users/${userId}/investmentTime`] = investmentTime;
            updates[`users/${userId}/investment`] = investment;
        });

        await db.ref().update(updates);

        return res.status(200).json({ message: "User data updated successfully" });
    } catch (error) {
        console.error("Error updating user data:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};