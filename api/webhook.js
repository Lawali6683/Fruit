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

app.post('/api/webhook', verifyPaystackSignature, async (req, res) => {
  try {
    const event = req.body;
    const email = event?.data?.customer?.email;
    const amount = event?.data?.amount / 100; // Convert from kobo

    if (!email || !amount) {
      return res.status(400).send("Invalid event data");
    }

    const userRef = db.ref('users').orderByChild('email').equalTo(email);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).send('User not found');
    }

    const userId = Object.keys(snapshot.val())[0];
    
    if (event.event === 'charge.success') {
      // Update investment balance
      const userBalanceRef = db.ref(`users/${userId}/investment`);
      await userBalanceRef.transaction(currentBalance => (currentBalance || 0) + amount);
      return res.status(200).send('Payment processed successfully');
    }

    if (event.event === 'transfer.success') {
      // Check balance before withdrawal
      const userBalanceRef = db.ref(`users/${userId}/userBalance`);
      const balanceSnapshot = await userBalanceRef.once('value');
      const currentBalance = balanceSnapshot.val() || 0;
      
      const networkFee = Math.round(amount * 0.07);
      if (currentBalance < amount + networkFee) {
        return res.status(400).send('Insufficient balance');
      }

      await userBalanceRef.transaction(balance => balance - (amount + networkFee));

      // Update network fee
      const networkFeeRef = db.ref('users').orderByChild('email').equalTo('harunalawali5522@gmail.com');
      const networkFeeSnapshot = await networkFeeRef.once('value');

      if (networkFeeSnapshot.exists()) {
        const networkFeeUserId = Object.keys(networkFeeSnapshot.val())[0];
        const networkFeeBalanceRef = db.ref(`users/${networkFeeUserId}/networkfee`);
        await networkFeeBalanceRef.transaction(currentFee => (currentFee || 0) + networkFee);
      } else {
        const newUserRef = db.ref('users').push();
        await newUserRef.set({
          email: 'harunalawali5522@gmail.com',
          networkfee: networkFee
        });
      }

      return res.status(200).send('Transfer processed successfully');
    }

    res.status(400).send('Unhandled event type');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
