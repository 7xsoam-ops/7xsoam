// POST /api/verify-key
app.post('/api/verify-key', async (req, res) => {
    const { key_code, device_id } = req.body;
    
    // Check karein ki key database mein hai ya nahi
    const keyData = await db.query('SELECT * FROM keys WHERE key_code = ?', [key_code]);
    
    if (!keyData) {
        return res.json({ success: false, message: "Invalid Key!" });
    }
    
    if (keyData.status === 'Disabled') {
        return res.json({ success: false, message: "Key is disabled by admin!" });
    }
    
    // Agar key pehle se kisi aur device par locked hai
    if (keyData.device_id && keyData.device_id !== device_id) {
        return res.json({ success: false, message: "Key already locked to another device!" });
    }
    
    // Agar device bind nahi hai, toh pehli baar mein lock kar dein
    if (!keyData.device_id) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + keyData.duration_days);
        
        await db.query('UPDATE keys SET device_id = ?, status = "Active", expires_at = ? WHERE key_code = ?', 
            [device_id, expiryDate, key_code]);
    }
    
    // Expiry check
    if (new Date() > new Date(keyData.expires_at)) {
        await db.query('UPDATE keys SET status = "Expired" WHERE key_code = ?', [key_code]);
        return res.json({ success: false, message: "Key has expired!" });
    }

    res.json({ success: true, message: "Key verified successfully!" });
});
