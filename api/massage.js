const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const API_AUTH_KEY = process.env.API_AUTH_KEY;

const app = express();
app.use(cors()); // Kunna CORS
app.use(express.json());

app.options("*", (req, res) => {
  res.status(200).send("OK");
});

app.post("/", (req, res) => {
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

  // Aika hashed secret key domin hana fallasa shi a fili
  const hash = crypto.createHash("sha256").update(PAYSTACK_SECRET_KEY).digest("hex");
  res.status(200).json({ hashedSecretKey: hash });
});

module.exports = app;
