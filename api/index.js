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

        const rawUrl = req.url || '';
        const pathOnly = rawUrl.split('?')[0];

        // 1. API Endpoint for Key Validation
        if (pathOnly === '/api' || pathOnly === '/api/') {
            const queryParams = new URL(rawUrl, 'http://localhost').searchParams;
            if (queryParams.has('key')) {
                const userKey = queryParams.get('key');
                const deviceId = queryParams.get('device') || 'UNKNOWN';
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
        }

        // 2. Admin Panel Endpoint
        if (pathOnly === '/api/admin' || pathOnly === '/api/admin/') {
            const queryParams = new URL(rawUrl, 'http://localhost').searchParams;
            const pass = queryParams.get('pass');

            if (pass !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Login</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#07090e; color:#00ffcc; font-family:monospace; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                        <div style="background:#121826; padding:30px; border:1px solid #222f49; border-radius:10px; text-align:center; width:280px;">
                            <h2>🔐 SECURE LOGIN</h2>
                            <form method="GET" action="/api/admin">
                                <input type="password" name="pass" placeholder="Password" required autofocus style="padding:12px; width:90%; background:#07090e; color:#fff; border:1px solid #222f49; border-radius:5px; text-align:center; font-size:16px;"><br><br>
                                <button type="submit" style="padding:12px; width:100%; background:#00ffcc; color:#07090e; border:none; font-weight:bold; border-radius:5px; cursor:pointer; font-size:16px;">ENTER</button>
                            </form>
                        </div>
                    </body>
                    </html>
                `);
            }

            const action = queryParams.get('action');
            if (action === 'generate') {
                const type = queryParams.get('type') || 'Normal';
                const days = parseInt(queryParams.get('days')) || 1;
                const label = queryParams.get('label') || 'User';
                
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let newKey = type === 'Advance' ? 'ADV-' : 'VIP-';
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
                const k = queryParams.get('key');
                const st = queryParams.get('status');
                await keysCollection.updateOne({ key: k }, { $set: { status: st === 'OFF' ? 'UNUSED' : 'OFF' } });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (action === 'delete') {
                await keysCollection.deleteOne({ key: queryParams.get('key') });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            const allKeys = await keysCollection.find({}).sort({ createdAt: -1 }).toArray();

            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Panel</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background:#07090e; color:#eee; font-family:monospace; padding:10px; margin:0;">
                    <div style="max-width:500px; margin:auto;">
                        <h2 style="color:#b19cd9; text-align:center;">⚡ RESELLER PANEL ⚡</h2>
                        <div style="background:#121826; padding:15px; border-radius:8px; border:1px solid #222f49; margin-bottom:15px;">
                            <form method="GET" action="/api/admin">
                                <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                                <input type="hidden" name="action" value="generate">
                                <label style="color:#00ffcc; font-size:12px;">TYPE</label>
                                <select name="type" style="width:100%; padding:8px; margin:5px 0 10px; background:#07090e; color:#fff; border:1px solid #222f49;">
                                    <option value="Normal">Normal Key</option>
                                    <option value="Advance">Advance Key</option>
                                </select>
                                <label style="color:#00ffcc; font-size:12px;">DURATION</label>
                                <select name="days" style="width:100%; padding:8px; margin:5px 0 10px; background:#07090e; color:#fff; border:1px solid #222f49;">
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="365">Lifetime</option>
                                </select>
                                <label style="color:#00ffcc; font-size:12px;">LABEL</label>
                                <input type="text" name="label" placeholder="Name" style="width:100%; padding:8px; margin:5px 0 10px; background:#07090e; color:#fff; border:1px solid #222f49; box-sizing:border-box;">
                                <button type="submit" style="width:100%; padding:10px; background:#00ffcc; color:#07090e; border:none; font-weight:bold; border-radius:5px; cursor:pointer;">GENERATE KEY</button>
                            </form>
                        </div>
                        <div style="background:#121826; padding:15px; border-radius:8px; border:1px solid #222f49;">
                            <h3 style="margin-top:0; color:#b19cd9; font-size:14px;">KEYS (${allKeys.length})</h3>
                            ${allKeys.map(k => `
                                <div style="background:#0b0f19; padding:10px; border-radius:5px; margin-bottom:8px; border:1px solid #1a233a; font-size:11px;">
                                    <div style="color:#00ffcc; font-weight:bold;">${k.key} [${k.status}]</div>
                                    <div style="color:#aaa; margin:3px 0;">Label: ${k.label} | Type: ${k.type}</div>
                                    <div style="color:#777;">Device: ${k.deviceId || 'None'}</div>
                                    <div style="margin-top:8px;">
                                        <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=toggle&key=${k.key}&status=${k.status}" style="background:#ffaa00; color:#000; padding:3px 6px; text-decoration:none; border-radius:3px; font-weight:bold; margin-right:5px;">${k.status === 'OFF' ? 'ON' : 'OFF'}</a>
                                        <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}" style="background:#ff4444; color:#fff; padding:3px 6px; text-decoration:none; border-radius:3px; font-weight:bold;">DEL</a>
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
