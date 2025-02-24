const admin = require("firebase-admin");

// **Firebase Admin Initialization**
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_DATABASE_SDK);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

export default async function handler(req, res) {
  // **Handle OPTIONS Request (CORS)**
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // **Verify API Key**
  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== process.env.API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  try {
    const event = req.body;
    const email = event?.data?.customer?.email;
    const amount = event?.data?.amount / 100; // Convert from kobo to naira

    if (!email || !amount) {
      return res.status(400).json({ error: "Invalid event data" });
    }

    const userRef = db.ref("users").orderByChild("email").equalTo(email);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = Object.keys(snapshot.val())[0];

    if (event.event === "charge.success") {
      // **Update Investment Balance**
      const userBalanceRef = db.ref(`users/${userId}/investment`);
      await userBalanceRef.transaction((currentBalance) => (currentBalance || 0) + amount);
      return res.status(200).json({ message: "Payment processed successfully" });
    }

    if (event.event === "transfer.success") {
      // **Check User Balance Before Transfer**
      const userBalanceRef = db.ref(`users/${userId}/userBalance`);
      const balanceSnapshot = await userBalanceRef.once("value");
      const currentBalance = balanceSnapshot.val() || 0;

      const networkFee = Math.round(amount * 0.07);
      if (currentBalance < amount + networkFee) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      await userBalanceRef.transaction((balance) => balance - (amount + networkFee));

      // **Update Network Fee for Admin**
      const adminEmail = "harunalawali5522@gmail.com";
      const networkFeeRef = db.ref("users").orderByChild("email").equalTo(adminEmail);
      const networkFeeSnapshot = await networkFeeRef.once("value");

      if (networkFeeSnapshot.exists()) {
        const networkFeeUserId = Object.keys(networkFeeSnapshot.val())[0];
        const networkFeeBalanceRef = db.ref(`users/${networkFeeUserId}/networkfee`);
        await networkFeeBalanceRef.transaction((currentFee) => (currentFee || 0) + networkFee);
      } else {
        const newUserRef = db.ref("users").push();
        await newUserRef.set({
          email: adminEmail,
          networkfee: networkFee
        });
      }

      return res.status(200).json({ message: "Transfer processed successfully" });
    }

    res.status(400).json({ error: "Unhandled event type" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: error.message });
  }
}
