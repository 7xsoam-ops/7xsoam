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

        if (pathname === '/api/check') {
            const key = query.get('key');
            if (!key) return res.json({ status: false, message: "Key required" });
            const keyDoc = await keysCollection.findOne({ key });
            if (!keyDoc || new Date(keyDoc.expiry) < new Date()) {
                return res.json({ status: false, message: "Invalid or Expired Key" });
            }
            return res.json({ status: true, message: "Success", expiry: keyDoc.expiry });
        }

        if (pathname === '/api/admin') {
            if (query.get('pass') !== ADMIN_PASSWORD) {
                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(`
                    <body style="background:#0b0914;color:#00ffcc;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                        <form method="GET" style="background:#131022;padding:30px;border-radius:10px;text-align:center;">
                            <h3>ADMIN LOGIN</h3>
                            <input type="password" name="pass" placeholder="Password" required style="padding:10px;margin-bottom:10px;"><br>
                            <button type="submit" style="padding:10px 20px;background:#00ffcc;border:none;font-weight:bold;">LOGIN</button>
                        </form>
                    </body>
                `);
            }

            if (query.get('action') === 'generate') {
                const newKey = `RABI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + parseInt(query.get('days') || 1));
                await keysCollection.insertOne({ key: newKey, expiry, createdAt: new Date() });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            if (query.get('action') === 'delete') {
                await keysCollection.deleteOne({ key: query.get('key') });
                res.writeHead(302, { Location: `/api/admin?pass=${ADMIN_PASSWORD}` });
                return res.end();
            }

            const allKeys = await keysCollection.find({}).toArray();
            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <body style="background:#0b0914;color:#fff;font-family:sans-serif;padding:20px;max-width:400px;margin:auto;">
                    <h2 style="color:#00ffcc;text-align:center;">ADMIN PANEL</h2>
                    <form method="GET" style="background:#131022;padding:15px;border-radius:8px;margin-bottom:15px;">
                        <input type="hidden" name="pass" value="${ADMIN_PASSWORD}">
                        <input type="hidden" name="action" value="generate">
                        <select name="days" style="width:100%;padding:8px;margin-bottom:10px;"><option value="1">1 Day</option><option value="7">7 Days</option></select>
                        <button type="submit" style="width:100%;padding:10px;background:#00ffcc;font-weight:bold;">GENERATE KEY</button>
                    </form>
                    <div style="background:#131022;padding:15px;border-radius:8px;">
                        <h3>Keys (${allKeys.length})</h3>
                        ${allKeys.map(k => `<div style="background:#0b0914;padding:8px;margin-bottom:5px;font-size:12px;">${k.key} <a href="/api/admin?pass=${ADMIN_PASSWORD}&action=delete&key=${k.key}" style="color:red;float:right;">DEL</a></div>`).join('')}
                    </div>
                </body>
            `);
        }
        return res.status(404).json({ error: "Not found" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
