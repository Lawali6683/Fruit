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

    // Handle POST request
    if (req.method === "POST") {
        try {
            const { userId, userBalance, dailyUpgrade, investmentTime, email, tsohonUser, referralBy } = req.body;

            if (!userId || !email) {
                return res.status(400).json({ error: "Invalid request payload" });
            }

            const userRef = db.ref(`users/${userId}`);
            const snapshot = await userRef.once("value");

            if (!snapshot.exists()) {
                return res.status(404).json({ error: "User not found" });
            }

            const userData = snapshot.val();

            const updates = {
                userBalance: userBalance || userData.userBalance,
                dailyUpgrade: dailyUpgrade || userData.dailyUpgrade,
                investmentTime: investmentTime || userData.investmentTime,
                tsohonUser: tsohonUser || userData.tsohonUser
            };

            if (tsohonUser === "false" && userData.investment > 0) {
                updates.userBalance = (userData.userBalance || 0) + 500;
            }

            if (referralBy) {
                const usersRef = db.ref("users");
                const usersSnapshot = await usersRef.once("value");

                let referrerUserId = null;
                usersSnapshot.forEach((childSnapshot) => {
                    const refData = childSnapshot.val();
                    if (refData.referralCode === referralBy) {
                        referrerUserId = childSnapshot.key;
                    }
                });

                if (referrerUserId) {
                    const referrerRef = db.ref(`users/${referrerUserId}`);
                    const referrerSnapshot = await referrerRef.once("value");

                    if (referrerSnapshot.exists()) {
                        const referrerData = referrerSnapshot.val();

                        if (!referrerData.referralPaidUsers || !referrerData.referralPaidUsers.includes(userId)) {
                            const referrerUpdates = {
                                userBalance: (referrerData.userBalance || 0) + updates.dailyUpgrade,
                                dailyUpgrade: (referrerData.dailyUpgrade || 0) + updates.dailyUpgrade,
                                referralPaidUsers: referrerData.referralPaidUsers ? [...referrerData.referralPaidUsers, userId] : [userId]
                            };

                            await referrerRef.update(referrerUpdates);
                        }
                    }
                }
            }

            await userRef.update(updates);
            res.status(200).json({ message: "User data updated successfully" });
        } catch (error) {
            console.error("Error updating user data:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
};