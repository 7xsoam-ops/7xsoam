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

        if (pathname === '/api/check' || pathname === '/api/check/') {
            const key = query.get('key');
            if (!key) return res.json({ status: false, message: "Key is required!" });

            const keyDoc = await keysCollection.findOne({ key: key });
            if (!keyDoc) return res.json({ status: false, message: "Invalid Key!" });

            const now = new Date();
            if (new Date(keyDoc.expiry) < now) {
                return res.json({ status: false, message: "Key Expired!" });
            }

            return res.json({ 
                status: true, 
                message: "Login Success!", 
                expiry: keyDoc.expiry,
                type: keyDoc.type 
            });
        }
                if (pathname === '/api/admin' || pathname === '/api/admin/') {
            const pass = query.get('pass');

            if (pass !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Admin Login</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background:#0b0914; color:#00ffcc; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                        <div style="background:#131022; padding:30px; border:1px solid #2a224a; border-radius:12px; text-align:center; width:300px;">
                            <h2>⚡ ADMIN LOGIN ⚡</h2>
                            <form method="GET" action="/api/admin">
                                <input type="password" name="pass" placeholder="Enter Password" required autofocus style="padding:12px; width:90%; background:#0b0914; color:#fff; border:1px solid #3b2f63; border-radius:8px; text-align:center; font-size:15px; margin-bottom:15px;"><br>
                                <button type="submit" style="padding:12px; width:100%; background:#00ffcc; color:#0b0914; border:none; font-weight:bold; border-radius:8px; cursor:pointer; font-size:15px;">LOGIN</button>
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
                const label = query.get('label') || 'User';

                const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
                const newKey = `RABI-${randomStr}-${Math.floor(1000 + Math.random() * 9000)}`;

                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + days);

                await keysCollection.insertOne({
                    key: newKey,
                    type: type,
                    expiry: expiryDate,
                    label: label,
                    createdAt: new Date()
                });

                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (action === 'delete') {
                const keyId = query.get('key');
                await keysCollection.deleteOne({ key: keyId });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            const allKeys = await keysCollection.find({}).toArray();
                                res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Admin Panel</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background:#0b0914; color:#fff; font-family:sans-serif; padding:15px; margin:0;">
                    <div style="max-width:450px; margin:auto;">
                        <h2 style="color:#00ffcc; text-align:center;">⚡ ADMIN PANEL ⚡</h2>

                        <div style="background:#131022; padding:15px; border-radius:12px; border:1px solid #2a224a; margin-bottom:15px;">
                            <h3 style="margin-top:0; color:#b19cd9; font-size:14px;">Generate New Key</h3>
                            <form method="GET" action="/api/admin">
                                <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                                <input type="hidden" name="action" value="generate">
                                
                                <label style="font-size:11px; color:#888;">KEY TYPE</label>
                                <select name="type" style="width:100%; padding:10px; margin:5px 0 10px; background:#0b0914; color:#fff; border:1px solid #2a224a; border-radius:8px;">
                                    <option value="Normal Key">Normal Key</option>
                                    <option value="Advance Key">Advance Key</option>
                                </select>

                                <label style="font-size:11px; color:#888;">DURATION (DAYS)</label>
                                <select name="days" style="width:100%; padding:10px; margin:5px 0 10px; background:#0b0914; color:#fff; border:1px solid #2a224a; border-radius:8px;">
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="365">Lifetime (365 Days)</option>
                                </select>

                                <label style="font-size:11px; color:#888;">CUSTOMER NAME / NOTE</label>
                                <input type="text" name="label" placeholder="e.g. My Friend" style="width:100%; padding:10px; margin:5px 0 10px; background:#0b0914; color:#fff; border:1px solid #2a224a; border-radius:8px; box-sizing:border-box;">

                                <button type="submit" style="width:100%; padding:12px; background:#00ffcc; color:#0b0914; border:none; font-weight:bold; border-radius:8px; cursor:pointer;">GENERATE KEY</button>
                            </form>
                        </div>

                        <div style="background:#131022; padding:15px; border-radius:12px; border:1px solid #2a224a;">
                            <h3 style="margin-top:0; color:#b19cd9; font-size:14px;">All Generated Keys (${allKeys.length})</h3>
                            ${allKeys.length === 0 ? '<div style="color:#666; text-align:center; padding:10px;">No keys generated yet.</div>' : ''}
                            ${allKeys.map(k => `
                                <div style="background:#0b0914; padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid #221a38; font-size:12px;">
                                    <div style="color:#00ffcc; font-weight:bold; font-size:13px;">${k.key}</div>
                                    <div style="color:#aaa; margin:3px 0;">Name: ${k.label} | Type: ${k.type}</div>
                                    <div style="color:#888; margin:3px 0;">Expires: ${new Date(k.expiry).toLocaleDateString()}</div>
                                    <div style="margin-top:8px;">
                                        <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}" style="background:#ff4444; color:#fff; padding:5px 10px; text-decoration:none; border-radius:4px; font-weight:bold;">DELETE</a>
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
