const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { read } = require("./db");

const configuredSecret = process.env.JWT_SECRET;
const SECRET = configuredSecret || crypto.randomBytes(32).toString("hex");

if (!configuredSecret) {
  console.warn("JWT_SECRET is not configured; using a temporary secret for this process.");
}

function sign(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: "8h" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function findUserById(id) {
  return read("users").find(u => u.id === id);
}

module.exports = { sign, auth, findUserById };
