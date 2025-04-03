const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const emailjs = require('emailjs-com');

const app = express();
app.use(bodyParser.json());

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;
const MONIEPOINT_SECRET_KEY = process.env.MONIEPOINT_SECRET_KEY;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_USER_ID = process.env.EMAILJS_USER_ID;

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

app.post('/webhook', async (req, res) => {
  // Verify Moniepoint Secret Key
  const signature = req.headers['x-moniepoint-signature'];
  if (!signature || signature !== MONIEPOINT_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized request' });
  }

  const { amount, accountNumber } = req.body;

  if (!amount || !accountNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check paymentPending for matching amount and accountNumber
    const paymentPendingRef = db.ref('paymentPending');
    const snapshot = await paymentPendingRef.once('value');
    let paymentPendingId = null;
    let email = null;

    snapshot.forEach(childSnapshot => {
      const data = childSnapshot.val();
      if (data.amount === amount && data.accountNumber === accountNumber && data.status === 'pending') {
        paymentPendingId = childSnapshot.key;
        email = data.email;
      }
    });

    if (!paymentPendingId || !email) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status to true
    await paymentPendingRef.child(paymentPendingId).update({ status: 'true' });

    // Update user investment amount
    const usersRef = db.ref('users');
    const userSnapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    userSnapshot.forEach(async userChild => {
      const userId = userChild.key;
      const userData = userChild.val();
      const newInvestmentAmount = (parseFloat(userData.investment) || 0) + parseFloat(amount);

      await usersRef.child(userId).update({ investment: newInvestmentAmount.toString() });

      // Send confirmation email using emailjs
      const templateParams = {
        to_name: userData.fullName,
        to_email: email,
        amount: amount,
        login_link: 'https://agrofruit.pages.dev'
      };

      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_USER_ID)
        .then(response => {
          console.log('Email sent successfully:', response.status, response.text);
        })
        .catch(error => {
          console.error('Error sending email:', error);
        });
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing payment:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = app;
