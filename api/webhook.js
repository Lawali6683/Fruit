const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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
const EMAIL_USER = "agrofruitenterprises@gmail.com";
const EMAIL_PASS = "ciivajkuisyifeux";
const MONIEPOINT_SECRET = "003a42b34ed141a28d52c36b6af67d9c_aae5f4"; // secret for validation

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    // Check for Moniepoint Secret (optional, log if mismatch)
    const providedSecret = req.headers["x-moniepoint-secret"];
    if (providedSecret && providedSecret !== MONIEPOINT_SECRET) {
      console.error("Invalid Moniepoint webhook secret.");
      return res.status(401).send("Unauthorized");
    }

    const { amount, accountNumber, accountName, transactionId } = req.body;

    if (!amount || !accountNumber || !accountName || !transactionId) {
      console.error("Missing required payment data");
      return res.status(400).send("Bad request");
    }

    const usersSnap = await db.ref("users").once("value");
    const users = usersSnap.val();

    let matchedUserId = null;
    let matchedKey = null;
    let matchedData = null;

    for (const [userId, userData] of Object.entries(users)) {
      const pendingPay = userData.pendingPay || {};
      for (const [key, pay] of Object.entries(pendingPay)) {
        if (
          parseFloat(pay.amount) === parseFloat(amount) &&
          pay.senderAccount === accountNumber &&
          normalizeName(pay.accountName).includes(normalizeName(accountName)) &&
          pay.status === "pending"
        ) {
          matchedUserId = userId;
          matchedKey = key;
          matchedData = pay;
          break;
        }
      }
      if (matchedUserId) break;
    }

    if (!matchedUserId) {
      console.error("No matching user/payment found for webhook");
      return res.status(404).send("No matching payment");
    }

    // Check for duplicate transaction
    const txnRef = `processedTransactions/${transactionId}`;
    const txnExists = await db.ref(txnRef).once("value");
    if (txnExists.exists()) {
      console.error("Duplicate transaction detected:", transactionId);
      return res.status(200).send("Already processed");
    }

    // Update user investment
    const userRef = db.ref(`users/${matchedUserId}`);
    const userSnap = await userRef.once("value");
    const user = userSnap.val();

    const currentInvestment = parseFloat(user.investment || 0);
    const newInvestment = currentInvestment + parseFloat(amount);
    await userRef.update({
      investment: newInvestment,
    });

    // Save processed transaction
    await db.ref(txnRef).set({
      userId: matchedUserId,
      amount,
      time: new Date().toISOString(),
    });

    // Delete all pendingPay entries
    await userRef.child("pendingPay").remove();

    // Send confirmation email
    const mailOptions = {
      from: `"AgroFruit Trading" <${EMAIL_USER}>`,
      to: matchedData.email,
      subject: "Payment Confirmation",
      html: `
        <div style="font-family:sans-serif;">
          <h2>Payment Confirmation</h2>
          <p>Hello ${user.fullName || "Valued User"},</p>
          <p>Your AgroFruit Trading deposit has been successfully received.</p>
          <h3>₦${amount}</h3>
          <p><a href="https://agrofruit.pages.dev">Login to Your Account</a></p>
          <p>If you have any issues, please contact admin at <a href="mailto:agrofruitenterprises@gmail.com">agrofruitenterprises@gmail.com</a>.</p>
        </div>
      `,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error("Email send error:", err);
      else console.log("Confirmation email sent:", info.response);
    });

    res.status(200).send("Payment processed");

  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).send("Internal server error");
  }
}
