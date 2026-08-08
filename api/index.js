const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const ADMIN_PASSWORD = "Soam@7521";

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    cachedDb = client.db('Cluster0');
    return cachedDb;
}

module.exports = async (req, res) => {
    try {
        const db = await connectToDatabase();
        const keysCollection = db.collection('keys');

        const urlObj = new URL(req.url, `https://${req.headers.host}`);
        const pathname = urlObj.pathname;
        const query = urlObj.searchParams;

        if (pathname === '/api' || pathname === '/api/') {
            if (query.has('key')) {
                const userKey = query.get('key');
                const deviceId = query.get('device') || 'UNKNOWN';
                const keyDoc = await keysCollection.findOne({ key: userKey });
                
                if (!keyDoc) return res.json({ status: false, message: "Invalid Key!" });
                if (keyDoc.status === 'OFF') return res.json({ status: false, message: "Key Disabled!" });
                if (new Date() > new Date(keyDoc.expiresAt)) return res.json({ status: false, message: "Expired!" });
                
                if (!keyDoc.deviceId) {
                    await keysCollection.updateOne({ key: userKey }, { $set: { deviceId: deviceId, status: 'ACTIVE' } });
                } else if (keyDoc.deviceId !== deviceId) {
                    return res.json({ status: false, message: "Device Mismatch!" });
                }
                return res.json({ status: true, message: "Success!", expiresAt: keyDoc.expiresAt });
            }
            return res.json({ status: false, message: "No key provided" });
        }

        if (pathname === '/api/admin' || pathname === '/api/admin/') {
            const pass = query.get('pass');

            if (pass !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Login - Reseller Panel</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#0b0914; color:#00ffcc; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                        <div style="background:#131022; padding:30px; border:1px solid #2a224a; border-radius:12px; text-align:center; width:300px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
                            <h2 style="color:#b19cd9; margin-bottom:20px; font-size:18px;">🔐 RESELLER LOGIN</h2>
                            <form method="GET" action="/api/admin">
                                <input type="password" name="pass" placeholder="Enter Password" required autofocus style="padding:12px; width:90%; background:#0b0914; color:#fff; border:1px solid #3b2f63; border-radius:8px; text-align:center; font-size:15px; outline:none;"><br><br>
                                <button type="submit" style="padding:12px; width:100%; background:linear-gradient(90deg, #00ffcc, #00bfff); color:#0b0914; border:none; font-weight:bold; border-radius:8px; cursor:pointer; font-size:15px;">LOGIN</button>
                            </form>
                        </div>
                    </body>
                    </html>
                `);
            }

            const action = query.get('action');
            if (action === 'generate') {
                const type = query.get('type') || 'Normal Key';
                const days = parseInt(query.get('days')) || 1;
                const label = query.get('label') || 'Customer';
                
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let newKey = type.includes('Advance') ? 'ADV-' : 'VIP-';
                for (let i = 0; i < 10; i++) newKey += chars.charAt(Math.floor(Math.random() * chars.length));
                
                await keysCollection.insertOne({
                    key: newKey,
                    type: type,
                    label: label,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + days * 86400000),
                    status: 'UNUSED',
                    deviceId: null
                });

                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }
            if (action === 'toggle') {
                const k = query.get('key');
                const st = query.get('status');
                await keysCollection.updateOne({ key: k }, { $set: { status: st === 'OFF' ? 'UNUSED' : 'OFF' } });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (action === 'delete') {
                await keysCollection.deleteOne({ key: query.get('key') });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            const allKeys = await keysCollection.find({}).sort({ createdAt: -1 }).toArray();

            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Reseller Panel</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { background: #0b0914; color: #fff; font-family: sans-serif; margin: 0; padding: 15px; }
                        .container { max-width: 450px; margin: auto; }
                        .header { font-size: 13px; color: #a29bfe; font-weight: bold; letter-spacing: 1px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                        .credits-box { background: #131022; border: 1px solid #2a224a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px; }
                        .credits-num { font-size: 32px; font-weight: bold; color: #b19cd9; margin: 5px 0; }
                        .tabs { display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #2a224a; padding-bottom: 10px; }
                        .tab { background: none; border: none; color: #888; font-size: 14px; font-weight: bold; cursor: pointer; padding: 5px 10px; }
                        .tab.active { color: #00ffcc; border-bottom: 2px solid #00ffcc; }
                        .card { background: #131022; border: 1px solid #2a224a; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
                        label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 5px; }
                        select, input { width: 100%; padding: 12px; background: #0b0914; color: #fff; border: 1px solid #2a224a; border-radius: 8px; margin-bottom: 15px; box-sizing: border-box; font-size: 14px; outline: none; }
                        .btn-generate { width: 100%; padding: 14px; background: #00ffcc; color: #0b0914; border: none; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 15px; text-transform: uppercase; }
                        .key-item { background: #0b0914; border: 1px solid #221a38; border-radius: 8px; padding: 12px; margin-bottom: 10px; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <span>🟢 RABI X PRIME – RESELLER</span>
                            <span style="color: #00ffcc;">${allKeys.length} KEYS</span>
                        </div>

                        <div class="credits-box">
                            <div style="font-size: 11px; color: #888; text-transform: uppercase;">Total Keys Generated</div>
                            <div class="credits-num">${allKeys.length}</div>
                            <div style="font-size: 11px; color: #555;">1 key = 1 generation</div>
                        </div>

                        <div class="tabs">
                            <button class="tab active">Generate</button>
                            <button class="tab">My Keys (${allKeys.length})</button>
                        </div>

                        <div class="card">
                            <form method="GET" action="/api/admin">
                                <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                                <input type="hidden" name="action" value="generate">
                                
                                <label>Key Type</label>
                                <select name="type">
                                    <option value="Normal Key">Normal Key</option>
                                    <option value="Advance Key">Advance Key</option>
                                </select>

                                <label>Duration (Days)</label>
                                <select name="days">
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="365">Lifetime (365 Days)</option>
                                </select>

                                <label>Label (optional)</label>
                                <input type="text" name="label" placeholder="e.g. Customer Name">

                                <button type="submit" class="btn-generate">⚡ Generate Key</button>
                            </form>
                        </div>

                        <div class="card">
                            <h3 style="margin-top:0; font-size:14px; color:#b19cd9;">MANAGED KEYS</h3>
                            ${allKeys.length === 0 ? '<div style="color:#666; text-align:center; padding:10px;">No keys generated yet.</div>' : ''}
                            ${allKeys.map(k => `
                                <div class="key-item">
                                    <div style="color:#00ffcc; font-weight:bold; font-size:13px; margin-bottom:4px;">${k.key}</div>
                                    <div style="color:#aaa; margin-bottom:6px;">Label: ${k.label} | Type: ${k.type}</div>
                                    <div style="color:#666; margin-bottom:8px;">Status: <span style="color:${k.status==='ACTIVE'?'#00ffcc':'#ffaa00'}">${k.status}</span></div>
                                    <div>
                                        <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=toggle&key=${k.key}&status=${k.status}" style="background:#ffaa00; color:#000; padding:4px 8px; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px; margin-right:5px;">${k.status === 'OFF' ? 'ENABLE' : 'DISABLE'}</a>
                                        <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}" style="background:#ff4444; color:#fff; padding:4px 8px; text-decoration:none; border-radius:4px; font-weight:bold; font-size:11px;">DELETE</a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
