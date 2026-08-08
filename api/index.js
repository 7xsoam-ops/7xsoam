const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const ADMIN_PASSWORD = "admin";

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    cachedDb = client.db('Cluster0');
    return cachedDb;
}

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

        // Safe URL Parsing for Vercel Serverless
        const host = req.headers.host || 'localhost';
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const fullUrl = new URL(req.url, `${protocol}://${host}`);
        const pathname = fullUrl.pathname;
        const query = fullUrl.searchParams;

        // 1. INJECTOR / APP LOGIN CHECK (/api?key=XYZ&device=123)
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
            
            if (!keyDoc.deviceId) {
                await keysCollection.updateOne({ key: userKey }, { $set: { deviceId: deviceId, status: 'ACTIVE' } });
            } else if (keyDoc.deviceId !== deviceId) {
                return res.status(200).json({ status: false, message: "Device Mismatch!" });
            }

            return res.status(200).json({ 
                status: true, 
                message: "Login Success!", 
                type: keyDoc.type,
                expiresAt: keyDoc.expiresAt 
            });
        }

        // 2. ADMIN PANEL (/api/admin)
        if (pathname === '/api/admin' || pathname === '/api/admin/') {
            const pass = query.get('pass');

            if (pass !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Admin Login</title>
                        <style>
                            body { background: #07090e; color: #00ffcc; font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                            .box { background: #121826; padding: 30px; border: 1px solid #222f49; border-radius: 12px; width: 280px; text-align: center; }
                            input { width: 90%; padding: 12px; margin: 15px 0; background: #07090e; border: 1px solid #222f49; color: #fff; border-radius: 6px; text-align: center; font-size: 16px; }
                            button { width: 100%; padding: 12px; background: #00ffcc; color: #07090e; border: none; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 16px; }
                        </style>
                    </head>
                    <body>
                        <div class="box">
                            <h2>🔐 SECURE LOGIN</h2>
                            <form method="GET" action="/api/admin">
                                <input type="password" name="pass" placeholder="Password" required autofocus>
                                <button type="submit">ENTER</button>
                            </form>
                        </div>
                    </body>
                    </html>
                `);
            }

            const action = query.get('action');
            if (action === 'generate') {
                const type = query.get('type') || 'Normal';
                const days = parseInt(query.get('days')) || 1;
                const label = query.get('label') || 'No Label';
                
                const newKeyVal = generateKey(type);
                const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

                await keysCollection.insertOne({
                    key: newKeyVal,
                    type: type,
                    label: label,
                    createdAt: new Date(),
                    expiresAt: expiresAt,
                    status: 'UNUSED',
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

            const allKeys = await keysCollection.find({}).sort({ createdAt: -1 }).toArray();
            const total = allKeys.length;
            const active = allKeys.filter(k => k.status === 'ACTIVE').length;
            const unused = allKeys.filter(k => k.status === 'UNUSED').length;
            const off = allKeys.filter(k => k.status === 'OFF').length;

            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Cyber Panel</title>
                    <style>
                        body { background: #07090e; color: #e0e0e0; font-family: monospace; margin: 0; padding: 10px; }
                        .container { max-width: 600px; margin: auto; }
                        h1 { color: #b19cd9; text-align: center; font-size: 18px; }
                        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 15px; }
                        .card { background: #121826; border: 1px solid #222f49; padding: 10px; border-radius: 8px; text-align: center; }
                        .card h3 { margin: 0; color: #00ffcc; font-size: 16px; }
                        .card p { margin: 4px 0 0; font-size: 10px; color: #888; }
                        .box { background: #121826; border: 1px solid #222f49; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
                        label { font-size: 11px; color: #b19cd9; display: block; margin-top: 6px; }
                        select, input { width: 100%; padding: 8px; margin-top: 4px; background: #07090e; border: 1px solid #222f49; color: #fff; border-radius: 4px; box-sizing: border-box; }
                        .btn { width: 100%; padding: 10px; background: #00ffcc; color: #07090e; border: none; font-weight: bold; border-radius: 4px; margin-top: 12px; cursor: pointer; }
                        .item { background: #0b0f19; border: 1px solid #1a233a; padding: 8px; border-radius: 6px; margin-top: 8px; font-size: 10px; }
                        .kt { color: #00ffcc; font-weight: bold; font-size: 11px; }
                        .badge { padding: 2px 5px; border-radius: 3px; font-size: 8px; font-weight: bold; }
                        .b-act { background: #00ffcc22; color: #00ffcc; border: 1px solid #00ffcc55; }
                        .b-un { background: #ffaa0022; color: #ffaa00; border: 1px solid #ffaa0055; }
                        .b-off { background: #ff444422; color: #ff4444; border: 1px solid #ff444455; }
                        .acts { margin-top: 6px; display: flex; gap: 5px; }
                        a.bt { text-decoration: none; padding: 3px 6px; font-size: 9px; border-radius: 3px; font-weight: bold; }
                        .bt-t { background: #ffaa0033; color: #ffaa00; border: 1px solid #ffaa00; }
                        .bt-d { background: #ff444433; color: #ff4444; border: 1px solid #ff4444; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚡ YASH X PRIME — PANEL ⚡</h1>
                        
                        <div class="stats">
                            <div class="card"><h3>${total}</h3><p>TOTAL</p></div>
                            <div class="card"><h3>${active}</h3><p>ACTIVE</p></div>
                            <div class="card"><h3>${unused}</h3><p>UNUSED</p></div>
                            <div class="card"><h3>${off}</h3><p>DISABLED</p></div>
                        </div>

                        <div class="box">
                            <form method="GET" action="/api/admin">
                                <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                                <input type="hidden" name="action" value="generate">
                                
                                <label>KEY TYPE</label>
                                <select name="type">
                                    <option value="Normal">Normal Key</option>
                                    <option value="Advance">Advance Key</option>
                                </select>

                                <label>DURATION</label>
                                <select name="days">
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="365">Lifetime</option>
                                </select>

                                <label>LABEL</label>
                                <input type="text" name="label" placeholder="e.g. Vishal">

                                <button type="submit" class="btn">GENERATE KEY</button>
                            </form>
                        </div>

                        <div class="box">
                            <h3 style="margin-top:0; color:#b19cd9; font-size:12px;">🔑 KEYS MANAGEMENT</h3>
                            ${allKeys.length === 0 ? '<p style="color:#555; text-align:center;">No keys yet.</p>' : ''}
                            ${allKeys.map(k => `
                                <div class="item">
                                    <div><span class="kt">${k.key}</span> <span class="badge ${k.status === 'ACTIVE' ? 'b-act' : k.status === 'UNUSED' ? 'b-un' : 'b-off'}">${k.status}</span></div>
                                    <div style="margin-top:3px; color:#aaa;">Type: <b>${k.type}</b> | Label: <b>${k.label || 'None'}</b></div>
                                    <div style="color:#777;">Expires: ${new Date(k.expiresAt).toLocaleString()}</div>
                                    <div style="color:#555; word-break:break-all;">Device: ${k.deviceId || 'Not Locked'}</div>
                                    <div class="acts">
                                        <a class="bt bt-t" href="/api/admin?pass=${ADMIN_PASSWORD}&action=toggle&key=${k.key}&status=${k.status}">${k.status === 'OFF' ? 'TURN ON' : 'TURN OFF'}</a>
                                        <a class="bt bt-d" href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}">DELETE</a>
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
