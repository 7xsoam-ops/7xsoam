const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection String
const MONGO_URI = "mongodb+srv://7xsoam_db_user:6HjHLqoD2nMCpMOY@cluster0.clymcxs.mongodb.net/keydb?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("DB Connected"))
  .catch(err => console.error("DB Error:", err));

// Database Model
const KeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  durationDays: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  status: { type: String, default: 'active' }
});

const Key = mongoose.models.Key || mongoose.model('Key', KeySchema);

// Admin Web Panel (Keys Generate Karne Ke Liye)
app.get('/api/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Key Generator Panel</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #0f0f1a; color: white; text-align: center; padding: 20px; }
        .card { background: #1a1a2e; max-width: 400px; margin: auto; padding: 25px; border-radius: 12px; border: 1px solid #bb86fc; }
        select, button { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: none; font-size: 16px; }
        select { background: #2a2a40; color: white; }
        button { background: #bb86fc; color: black; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🔑 VIP Key Generator</h2>
        <form action="/api/generate" method="POST">
          <label>Select Key Validity:</label>
          <select name="days">
            <option value="1">1 Day</option>
            <option value="7">7 Days</option>
            <option value="30">30 Days</option>
            <option value="365">1 Year / Lifetime</option>
          </select>
          <button type="submit">GENERATE KEY 🚀</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Key Generation API
app.post('/api/generate', async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 1;
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const newKey = `VIP-${randomNum}`;
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await Key.create({
      key: newKey,
      durationDays: days,
      expiresAt: expiresAt
    });

    res.send(`
      <body style="background:#0f0f1a; color:white; text-align:center; font-family:sans-serif; padding-top:50px;">
        <div style="background:#1a1a2e; max-width:400px; margin:auto; padding:20px; border-radius:12px; border:1px solid #00ffcc;">
          <h2>✅ Key Generated!</h2>
          <h1 style="color:#00ffcc; letter-spacing: 2px;">${newKey}</h1>
          <p>Validity: <b>${days} Day(s)</b></p>
          <p>Expires: ${expiresAt.toLocaleString()}</p>
          <br>
          <a href="/api/admin" style="color:#bb86fc; text-decoration:none; font-weight:bold;">← Generate Another Key</a>
        </div>
      </body>
    `);
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

// App Validation Check Endpoint
app.all('/api', async (req, res) => {
  const userKey = req.query.key || req.body.key;
  if (!userKey) {
    return res.status(400).json({ status: "error", message: "Key parameter missing" });
  }

  try {
    const keyData = await Key.findOne({ key: userKey });
    if (!keyData) {
      return res.status(401).json({ status: "error", message: "Invalid Key!" });
    }

    if (new Date() > new Date(keyData.expiresAt)) {
      return res.status(403).json({ status: "error", message: "Key Expired!" });
    }

    return res.json({ status: "success", message: "Access Granted", expiresAt: keyData.expiresAt });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = app;
