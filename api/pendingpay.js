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
    res.setHeader("Access-Control-Allow-Origin", "https://agrofruit.pages.dev");
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

    if (req.method === "POST") {
        const { amount, email, senderAccount, accountName } = req.body;

        if (!amount || !email || !senderAccount || !accountName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const userPaymentRef = db.ref("users").orderByChild("email").equalTo(email);

        userPaymentRef.once("value", async (snapshot) => {
            let userId;
            if (snapshot.exists()) {
                userId = Object.keys(snapshot.val())[0];
            } else {
                const newUserRef = db.ref("users").push();
                userId = newUserRef.key;
                await newUserRef.set({ email });
            }

            const pendingPayRef = db.ref(`users/${userId}/pendingPay`);

            pendingPayRef.once("value", async (pendingSnapshot) => {
                if (pendingSnapshot.exists()) {
                    await pendingPayRef.remove();
                }

                const paymentData = {
                    amount,
                    email,
                    senderAccount,
                    accountName,
                    status: "pending",
                    time: new Date().toISOString(),
                };

                try {
                    await pendingPayRef.set(paymentData);
                    return res.status(200).json({ success: true, userId });
                } catch (error) {
                    console.error("Error storing payment data: ", error);
                    return res.status(500).json({ error: "Internal Server Error" });
                }
            });
        });
    } else {
        return res.status(405).json({ error: "Method not allowed" });
    }
};
