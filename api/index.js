
module.exports = (req, res) => {
  const { key, hwid } = req.query;

  // Yahan aap apni keys add kar sakte ho
  const validKeys = {
    "RAVI-VIP-101": { status: "active" },
    "TEST-KEY-007": { status: "active" }
  };

  if (!key) {
    return res.status(400).json({ status: "failed", message: "Please enter a key" });
  }

  if (validKeys[key]) {
    return res.status(200).json({ status: "success", message: "Login Successful!" });
  } else {
    return res.status(400).json({ status: "failed", message: "Invalid Key!" });
  }
};
