const express = require("express");
const prisma = require("../utils/prisma");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/locations", async (req, res) => {
  res.json(await prisma.location.findMany({ orderBy: { id: "asc" } }));
});

router.post("/locations", authorize("ADMIN"), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const loc = await prisma.location.create({ data: { name } });
  res.status(201).json(loc);
});

router.get("/items", async (req, res) => {
  res.json(await prisma.item.findMany({ orderBy: { id: "asc" } }));
});

router.post("/items", authorize("ADMIN"), async (req, res) => {
  const { name, category } = req.body;
  if (!name || !category) return res.status(400).json({ error: "name and category are required" });
  const item = await prisma.item.create({ data: { name, category } });
  res.status(201).json(item);
});

router.get("/users", authorize("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, locationId: true },
    orderBy: { id: "asc" },
  });
  res.json(users);
});

module.exports = router;