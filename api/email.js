const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
        databaseURL: FIREBASE_DATABASE_URL,
    });
}

const db = admin.database();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'agrofruitenterprises@gmail.com',
        pass: 'ciivajkuisyifeux'
    }
});

const sendEmails = async (req, res) => {
    try {
        const snapshot = await db.ref("users").once("value");
        const users = snapshot.val();
        const userEmails = [];
        const referralEmails = [];

        for (const userId in users) {
            const user = users[userId];
            if (user.tsohonUser === false && user.investment === 0.00) {
                userEmails.push(user.email);
            } else if (user.tsohonUser === true && user.investment > 0.00) {
                referralEmails.push(user.email);
            }
        }

        const mailOptions = {
            from: "agrofruitenterprises@gmail.com",
            to: userEmails,
            subject: "🎉 Congratulations! AgroFruit Investment Awaits You!",
            html: `
            <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif; border-radius: 10px;">
                <h2 style="color: green; text-align: center;">🌱 Welcome to AgroFruit – Your Profitable Investment!</h2>
                <p style="font-size: 16px;">Dear <b>(fullName)</b>,</p>
                <p>AgroFruit gives you a great opportunity to invest and earn daily profits! Choose from our amazing packages below and start making money every day. 📈</p>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <!-- Add your investment packages here -->
                </table>
                <p style="font-size: 16px;">💡 **Special Bonus:** Earn an extra **₦150,000** if you bring more referrals! 🚀</p>
                <h3 style="color: green; text-align: center;">🔑 Start Now!</h3>
                <p>Login to your AgroFruit account, copy your account number, and make a deposit to start earning daily.</p>
                <p><b>🎁 Welcome Bonus:</b> ₦500 | <b>💸 Minimum Withdrawal:</b> ₦500</p>
                <p>If you have any questions, our **customer care team** is always available to assist you. 🤝</p>
                <p style="text-align: center;"><a href="https://yourwebsite.com" style="background-color: green; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start Investing Now</a></p>
                <p style="text-align: center;"><img src="https://yourwebsite.com/images/agrofruit-banner.jpg" alt="AgroFruit Banner" width="500"></p>
                <p style="text-align: center; font-size: 14px; color: #666;">🔹 AgroFruit Teams | 📩 Contact Support</p>
            </div>`
        };

        await transporter.sendMail(mailOptions);

        const referralMailOptions = {
            from: "agrofruitenterprises@gmail.com",
            to: referralEmails,
            subject: "🎉 (fullName), You Won ₦105,000 in AgroFruit!",
            html: `
            <div style="background-color: #f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
                <h2 style="color: green; text-align: center;">🎉 Congratulations (fullName)!</h2>
                <p>You've just won **₦105,000** in your AgroFruit account! 🎊💰</p>
                <p>💡 To earn more, share your **referral link** from your AgroFruit account under <b>"Referrals Program"</b> and attach proof of your earnings (screenshot). Post it on social media using **#AgroFruit #EasyProfits**.</p>
                <p>🎁 Bonus Prizes Available: ₦10,000 – ₦40,000!</p>
                <p style="text-align: center;"><a href="https://yourwebsite.com" style="background-color: green; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start Referring Now</a></p>
            </div>`
        };

        await transporter.sendMail(referralMailOptions);

        return res.status(200).json({ message: "Emails sent successfully!" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Error sending email." });
    }
};

module.exports = sendEmails;