const jwt = require("jsonwebtoken");
const { read } = require("./db");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

if (process.env.NODE_ENV === "production" &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === "replace-with-a-long-random-secret")) {
  throw new Error("JWT_SECRET must be configured with a strong value in production");
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
