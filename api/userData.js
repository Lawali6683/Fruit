const admin = require("firebase-admin");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
        databaseURL: FIREBASE_DATABASE_URL,
    });
}

const db = admin.database();

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    const origin = req.headers.origin;
    if (origin !== "https://agrofruit.pages.dev") {
        console.error("Invalid origin:", origin);
        return res.status(403).json({ error: "Forbidden origin" });
    }

    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        console.error("Invalid or missing API Key");
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const {
        uid,
        fullName,
        gender,
        county,
        address,
        username,
        phoneNumber,
        email,
        referralCode,
        referralBy,
        referralLink
    } = req.body;

    try {
        await db.ref(`users/${uid}`).set({
            fullName,
            gender,
            county,
            address,
            username,
            phoneNumber,
            email,
            referralCode,
            referralBy,
            referralCount: 0,
            referralLink,
            dailyUpgrade: 0.00,
            investment: 0.00,
            tsohonUser: false,
            userBalance: 0.00,
            accountNumber: [],
            withdrawalPending: [],
            withdrawalHistory: [],
            registrationDate: new Date().toISOString(),
            activeStatus: true
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error saving user data:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
