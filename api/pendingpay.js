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

        const userRef = db.ref("users").orderByChild("email").equalTo(email);
        userRef.once("value", async (snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                const userId = Object.keys(userData)[0];
                const userRequirementsRef = db.ref(`userRequirements/${userId}`);

                // Add new requirement
                const newRequirementRef = userRequirementsRef.push();
                const requirementData = {
                    amount,
                    email,
                    senderAccount,
                    accountName,
                    status: "pending",
                    time: new Date().toISOString()
                };

                try {
                    await newRequirementRef.set(requirementData);
                    return res.status(200).json({ success: true, requirementId: newRequirementRef.key });
                } catch (error) {
                    console.error("Error storing requirement data: ", error);
                    return res.status(500).json({ error: "Internal Server Error" });
                }
            } else {
                return res.status(404).json({ error: "User not found" });
            }
        });
    } else {
        return res.status(405).json({ error: "Method not allowed" });
    }
};
