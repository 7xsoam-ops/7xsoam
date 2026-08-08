  const { MongoClient } = require('mongodb');

// ================= CONFIGURATION =================
const uri = process.env.MONGODB_URI; // Vercel environment variable se connect hoga
const ADMIN_PASSWORD = "admin";    // Yahan apna pasandida password rakh sakte ho (Jaise: 7xsoam)
// =================================================

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    cachedDb = client.db('Cluster0'); // Apne database ka naam yahan check kar lena
    return cachedDb;
}

// Random Key Generator
function generateKey(type) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = type === 'Advance' ? 'ADV-' : 'VIP-';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = async (req, res) => {
    try {
        const db = await connectToDatabase();
        const keysCollection = db.collection('keys');
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        const query = url.searchParams;

        // 1. APP / INJECTOR LOGIN VERIFICATION API
        // URL: /api?key=YOUR_KEY&device=DEVICE_ID
        if (pathname === '/api' && query.has('key')) {
            const userKey = query.get('key');
            const deviceId = query.get('device') || 'UNKNOWN';
            
            const keyDoc = await keysCollection.findOne({ key: userKey });
            
            if (!keyDoc) {
                return res.status(200).json({ status: false, message: "Invalid Key!" });
            }
            if (keyDoc.status === 'OFF') {
                return res.status(200).json({ status: false, message: "Key is Disabled by Admin!" });
            }
            if (new Date() > new Date(keyDoc.expiresAt)) {
                return res.status(200).json({ status: false, message: "Key Expired!" });
            }
            
            // Device Locking System
            if (!keyDoc.deviceId) {
                await keysCollection.updateOne({ key: userKey }, { $set: { deviceId: deviceId, status: 'ACTIVE' } });
            } else if (keyDoc.deviceId !== deviceId) {
                return res.status(200).json({ status: false, message: "Device Mismatch! Key locked to another device." });
            }

            return res.status(200).json({ 
                status: true, 
                message: "Login Success!", 
                type: keyDoc.type,
                expiresAt: keyDoc.expiresAt 
            });
        }

        // 2. ADMIN PANEL INTERFACE (/api/admin)
        if (pathname === '/api/admin') {
            const pass = query.get('pass');

            // Password Protection Screen
            if (pass !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Admin Login — Cyber Panel</title>
                        <style>
                            body { background: #0b0f19; color: #00ffcc; font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                            .login-box { background: #121826; padding: 30px; border: 1px solid #00ffcc33; border-radius: 12px; box-shadow: 0 0 20px rgba(0,255,204,0.1); width: 300px; text-align: center; }
                            input { width: 90%; padding: 12px; margin: 15px 0; background: #0b0f19; border: 1px solid #00ffcc55; color: #fff; border-radius: 6px; text-align: center; font-size: 16px; }
                            button { width: 100%; padding: 12px; background: #00ffcc; color: #0b0f19; border: none; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 16px; }
                            button:hover { background: #00b388; }
                        </style>
                    </head>
                    <body>
                        <div class="login-box">
                            <h2>🔐 SECURE LOGIN</h2>
                            <form method="GET" action="/api/admin">
                                <input type="password" name="pass" placeholder="Enter Admin Password" required autofocus>
                                <button type="submit">ACCESS PANEL</button>
                            </form>
                        </div>
                    </body>
                    </html>
                `);
            }

            // Handle Actions (Generate, Toggle, Delete)
            const action = query.get('action');
            if (action === 'generate') {
                const type = query.get('type') || 'Normal';
                const durationDays = parseInt(query.get('days')) || 1;
                const label = query.get('label') || 'No Label';
                
                const newKeyVal = generateKey(type);
                const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

                await keysCollection.insertOne({
                    key: newKeyVal,
                    type: type,
                    label: label,
                    createdAt: new Date(),
                    expiresAt: expiresAt,
                    status: 'UNUSED', // UNUSED, ACTIVE, OFF
                    deviceId: null
                });

                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (action === 'toggle') {
                const targetKey = query.get('key');
                const currentStatus = query.get('status');
                const newStatus = currentStatus === 'OFF' ? 'UNUSED' : 'OFF';
                await keysCollection.updateOne({ key: targetKey }, { $set: { status: newStatus } });

                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (action === 'delete') {
                const targetKey = query.get('key');
                await keysCollection.deleteOne({ key: targetKey });

                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            // Fetch Stats & Keys List from DB
            const allKeys = await keysCollection.find({}).sort({ createdAt: -1 }).toArray();
            const totalKeys = allKeys.length;
            const activeKeys = allKeys.filter(k => k.status === 'ACTIVE').length;
            const unusedKeys = allKeys.filter(k => k.status === 'UNUSED').length;
            const disabledKeys = allKeys.filter(k => k.status === 'OFF').length;

            // Hacker Cyber Style Dashboard HTML
            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Cyber Reseller Dashboard</title>
                    <style>
                        body { background: #07090e; color: #e0e0e0; font-family: monospace; margin: 0; padding: 10px; }
                        .container { max-width: 600px; margin: auto; }
                        h1 { color: #b19cd9; text-align: center; font-size: 20px; text-shadow: 0 0 10px rgba(177,156,217,0.3); }
                        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
                        .stat-card { background: #121826; border: 1px solid #222f49; padding: 12px; border-radius: 8px; text-align: center; }
                        .stat-card h3 { margin: 0; color: #00ffcc; font-size: 18px; }
                        .stat-card p { margin: 5px 0 0; font-size: 11px; color: #888; }
                        .card { background: #121826; border: 1px solid #222f49; padding: 15px; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                        label { font-size: 12px; color: #b19cd9; display: block; margin-top: 8px; }
                        select, input { width: 100%; padding: 10px; margin-top: 5px; background: #07090e; border: 1px solid #222f49; color: #fff; border-radius: 6px; box-sizing: border-box; }
                        .btn-gen { width: 100%; padding: 12px; background: #00ffcc; color: #07090e; border: none; font-weight: bold; border-radius: 6px; margin-top: 15px; cursor: pointer; font-size: 14px; }
                        .btn-gen:hover { background: #00b388; }
                        .key-item { background: #0b0f19; border: 1px solid #1a233a; padding: 10px; border-radius: 6px; margin-top: 10px; font-size: 11px; }
                        .key-text { color: #00ffcc; font-weight: bold; font-size: 12px; word-break: break-all; }
                        .badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; }
                        .badge-active { background: #00ffcc22; color: #00ffcc; border: 1px solid #00ffcc55; }
                        .badge-unused { background: #ffaa0022; color: #ffaa00; border: 1px solid #ffaa0055; }
                        .badge-off { background: #ff444422; color: #ff4444; border: 1px solid #ff444455; }
                        .actions { margin-top: 8px; display: flex; gap: 5px; }
                        a.btn-action { text-decoration: none; padding: 4px 8px; font-size: 10px; border-radius: 4px; font-weight: bold; }
                        .btn-toggle { background: #ffaa0033; color: #ffaa00; border: 1px solid #ffaa00; }
                        .btn-delete { background: #ff444433; color: #ff4444; border: 1px solid #ff4444; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚡ YASH X PRIME — CYBER PANEL ⚡</h1>
                        
                        <div class="stats-grid">
                            <div class="stat-card">
                                <h3>${totalKeys}</h3>
                                <p>TOTAL KEYS</p>
                            </div>
                            <div class="stat-card">
                                <h3>${activeKeys}</h3>
                                <p>LOCKED TO DEVICE</p>
                            </div>
                            <div class="stat-card">
                                <h3>${unusedKeys}</h3>
                                <p>UNUSED KEYS</p>
                            </div>
                            <div class="stat-card">
                                <h3>${disabledKeys}</h3>
                                <p>DISABLED KEYS</p>
                            </div>
                        </div>

                        <div class="card">
                            <form method="GET" action="/api/admin">
                                <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                                <input type="hidden" name="action" value="generate">
                                
                                <label>KEY TYPE</label>
                                <select name="type">
                                    <option value="Normal">Normal Key</option>
                                    <option value="Advance">Advance Key</option>
                                </select>

                                <label>DURATION (DAYS)</label>
                                <select name="days">
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="365">Lifetime (365 Days)</option>
                                </select>

                                <label>LABEL (OPTIONAL)</label>
                                <input type="text" name="label" placeholder="e.g. Vishal">

                                <button type="submit" class="btn-gen">⚡ GENERATE KEY</button>
                            </form>
                        </div>

                        <div class="card">
                            <h3 style="margin-top:0; color:#b19cd9; font-size:14px;">🔑 CREATED KEYS MANAGEMENT</h3>
                            ${allKeys.length === 0 ? '<p style="color:#666; text-align:center;">No keys generated yet.</p>' : ''}
                            ${allKeys.map(k => `
                                <div class="key-item">
                                    <div><span class="key-text">${k.key}</span> <span class="badge ${k.status === 'ACTIVE' ? 'badge-active' : k.status === 'UNUSED' ? 'badge-unused' : 'badge-off'}">${k.status}</span></div>
                                    <div style="margin-top:4px; color:#aaa;">Type: <b>${k.type}</b> | Label: <b>${k.label || 'None'}</b></div>
                                    <div style="color:#777;">Expires: ${new Date(k.expiresAt).toLocaleString()}</div>
                                    <div style="color:#555; word-break:break-all;">Device: ${k.deviceId || 'Not Locked Yet'}</div>
                                    <div class="actions">
                                        <a class="btn-action btn-toggle" href="/api/admin?pass=${ADMIN_PASSWORD}&action=toggle&key=${k.key}&status=${k.status}">${k.status === 'OFF' ? 'TURN ON' : 'TURN OFF'}</a>
                                        <a class="btn-action btn-delete" href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}">DELETE</a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </body>
                </html>
            `);
        }

        return res.status(404).json({ error: "Not Found" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
