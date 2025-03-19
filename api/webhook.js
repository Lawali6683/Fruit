const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;

// Initialize Firebase Admin
if (SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL
  });
} else {
  console.error("Firebase SDK not configured correctly.");
  process.exit(1);
}

const db = admin.database();

// Middleware to verify Paystack signature
function verifyPaystackSignature(req, res, next) {
  if (!req.headers['x-paystack-signature']) return res.status(401).send('Signature missing');
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
  if (hash === req.headers['x-paystack-signature']) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
}

// Function to ensure referral bonus is not duplicated
async function processReferralBonus(referralCode, matchedPlan, newUserId) {
  try {
    const usersRef = db.ref("users");
    const usersSnapshot = await usersRef.once("value");

    if (!usersSnapshot.exists()) return;

    let referrerUserId = null;
    usersSnapshot.forEach((childSnapshot) => {
      const userData = childSnapshot.val();
      if (userData.referralCode === referralCode) {
        referrerUserId = childSnapshot.key;
      }
    });

    if (!referrerUserId) return;

    const referrerRef = db.ref(`users/${referrerUserId}`);
    const referrerSnapshot = await referrerRef.once("value");

    if (referrerSnapshot.exists()) {
      const referrerData = referrerSnapshot.val();

      // Ensure referral bonus is not paid twice
      if (referrerData.referralPaidUsers && referrerData.referralPaidUsers.includes(newUserId)) {
        return;
      }

      const referrerUpdates = {
        userBalance: (referrerData.userBalance || 0) + matchedPlan.referralBonus,
        dailyUpgrade: (referrerData.dailyUpgrade || 0) + matchedPlan.referralUpgrade,
        referralPaidUsers: referrerData.referralPaidUsers ? [...referrerData.referralPaidUsers, newUserId] : [newUserId]
      };

      await referrerRef.update(referrerUpdates);
    }
  } catch (error) {
    console.error("Error processing referral bonus:", error);
  }
}

// Function to handle investment logic
async function handleInvestmentLogic(userId, userData) {
  if (!userData) {
    console.error("User data not found.");
    return;
  }

  const investmentData = parseFloat(userData.investment) || 0;
  const currentTime = new Date();
  const tsohonUser = userData.tsohonUser || "false";
  const investmentTime = new Date(userData.investmentTime || currentTime.toISOString());
  const daysElapsed = Math.floor((currentTime - investmentTime) / (1000 * 60 * 60 * 24));

  const investmentMap = [
    { amount: 3500, dailyUpgrade: 160, referralBonus: 250, referralUpgrade: 12.8, days: 35 },
    { amount: 8000, dailyUpgrade: 350, referralBonus: 600, referralUpgrade: 28, days: 35 },
    { amount: 15000, dailyUpgrade: 750, referralBonus: 950, referralUpgrade: 124.8, days: 36 },
    { amount: 35000, dailyUpgrade: 1560, referralBonus: 2100, referralUpgrade: 124.8, days: 37 },
    { amount: 70000, dailyUpgrade: 3160, referralBonus: 4300, referralUpgrade: 245.6, days: 39 },
    { amount: 140000, dailyUpgrade: 6240, referralBonus: 9200, referralUpgrade: 499.2, days: 40 },
    { amount: 280000, dailyUpgrade: 12300, referralBonus: 15300, referralUpgrade: 998.4, days: 42 },
  ];

  let matchedPlan = investmentMap.find(plan => plan.amount === investmentData);
  if (!matchedPlan) {
    if (investmentData > 3500) {
      matchedPlan = investmentMap.reduce((prev, curr) => (curr.amount <= investmentData ? curr : prev), investmentMap[0]);
    } else {
      matchedPlan = null;
    }
  }

  const updates = {
    lastUpdate: currentTime.toISOString(),
    tsohonUser: tsohonUser === "false" ? "yes" : tsohonUser,
    investment: investmentData, // Update the investment amount regardless
  };

  if (matchedPlan) {
    if (daysElapsed >= matchedPlan.days) {
      updates.investment = 0;
      updates.dailyUpgrade = 0;
      updates.investmentTime = null;
    } else {
      if (!userData.dailyUpgrade || userData.dailyUpgrade !== matchedPlan.dailyUpgrade) {
        updates.dailyUpgrade = matchedPlan.dailyUpgrade;
      }
      if (!userData.investmentTime) {
        updates.investmentTime = currentTime.toISOString();
      }
      if (userData.referralBy && !userData.referralPaid) {
        await processReferralBonus(userData.referralBy, matchedPlan, userId);
        updates.referralPaid = true;
      }
      if (tsohonUser === "false" && investmentData >= 3500) {
        updates.userBalance = (userData.userBalance || 0) + 500;
      }
    }
  }

  await db.ref(`users/${userId}`).update(updates);
}

app.post('/api/webhook', verifyPaystackSignature, async (req, res) => {
  try {
    const event = req.body;
    const transactionId = event?.data?.id; // Unique transaction ID daga Paystack
    const email = event?.data?.customer?.email;
    const amount = event?.data?.amount / 100; // Convert from kobo to naira

    if (!transactionId || !email || !amount) {
      return res.status(400).send("Invalid event data");
    }

    // **Duba ko wannan transaction ID ya riga ya yi amfani**
    const transactionRef = db.ref(`transactions/${transactionId}`);
    const transactionSnapshot = await transactionRef.once('value');

    if (transactionSnapshot.exists()) {
      return res.status(400).send("Duplicate transaction detected");
    }

    // **Adana wannan transaction domin hana sake amfani da shi**
    await transactionRef.set({
      email,
      amount,
      event: event.event,
      timestamp: Date.now()
    });

    // Nemo user a database
    const userRef = db.ref('users').orderByChild('email').equalTo(email);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    const userId = Object.keys(snapshot.val())[0];
    const userData = snapshot.val()[userId];

    if (event.event === 'charge.success') {
      // Sabunta balance na user
      const userBalanceRef = db.ref(`users/${userId}/investment`);
      await userBalanceRef.transaction(currentBalance => (currentBalance || 0) + amount);

      // Handle investment logic
      await handleInvestmentLogic(userId, userData);

      return res.status(200).send('Payment processed successfully');
    }

    if (event.event === 'transfer.success') {
      // Nemo balance na user
      const userBalanceRef = db.ref(`users/${userId}/userBalance`);
      const balanceSnapshot = await userBalanceRef.once('value');
      const currentBalance = balanceSnapshot.val() || 0;

      // Ƙididdiga na **network fee** (7% fee)
      const networkFee = Math.round(amount * 0.07);
      const totalDeduction = amount + networkFee;

      if (currentBalance < totalDeduction) {
        return res.status(400).send({
          message: 'Insufficient balance',
          currentBalance: currentBalance,
          requiredBalance: totalDeduction
        });
      }

      // Rage kudin daga balance na user
      await userBalanceRef.transaction(balance => balance - totalDeduction);

      // **Network Fee Processing** - Nemo admin
      const networkFeeAdminRef = db.ref('users').orderByChild('email').equalTo('harunalawali5522@gmail.com');
      const networkFeeSnapshot = await networkFeeAdminRef.once('value');

      if (networkFeeSnapshot.exists()) {
        const networkFeeUserId = Object.keys(networkFeeSnapshot.val())[0];
        const networkFeeBalanceRef = db.ref(`users/${networkFeeUserId}/networkfee`);
        await networkFeeBalanceRef.transaction(currentFee => (currentFee || 0) + networkFee);
      } else {
        // Idan admin bai wanzu ba, ƙirƙiri shi
        const newAdminRef = db.ref('users').push();
        await newAdminRef.set({
          email: 'harunalawali5522@gmail.com',
          networkfee: networkFee
        });
      }

      return res.status(200).send('Withdrawal processed successfully');
    }

    res.status(400).send('Unhandled event type');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;()
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
