const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

const VALID_ROLES = ["ADMIN", "OPERATIONS", "SALES"];

// POST /api/auth/register  (open for demo purposes; an Admin would normally do this)
router.post("/register", async (req, res) => {
  const { username, password, role, locationId } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password and role are required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(", ")}` });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, role, locationId: locationId || null },
  });

  return res.status(201).json({ id: user.id, username: user.username, role: user.role });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, locationId: user.locationId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, locationId: user.locationId },
  });
});

module.exports = router;
