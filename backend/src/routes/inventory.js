const express = require("express");
const prisma = require("../utils/prisma");
const { authenticate, authorize } = require("../middleware/auth");
const { available, markDamaged, InsufficientStockError } = require("../utils/inventoryService");

const router = express.Router();
router.use(authenticate);

function serialize(inv) {
  return {
    id: inv.id,
    item: inv.item,
    location: inv.location,
    batch: inv.batch,
    physicalQty: inv.physicalQty,
    reservedQty: inv.reservedQty,
    availableQty: available(inv),
  };
}

// GET /api/inventory
router.get("/", async (req, res) => {
  const rows = await prisma.inventory.findMany({
    include: { item: true, location: true },
    orderBy: { id: "asc" },
  });
  res.json(rows.map(serialize));
});

// POST /api/inventory  - create/receive stock (Admin, Operations)
router.post("/", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  const { itemId, locationId, batch, physicalQty } = req.body;

  if (!itemId || !locationId || !batch || physicalQty == null) {
    return res.status(400).json({ error: "itemId, locationId, batch and physicalQty are required" });
  }
  if (!Number.isInteger(physicalQty) || physicalQty < 0) {
    return res.status(400).json({ error: "physicalQty must be a non-negative integer" });
  }

  try {
    const existing = await prisma.inventory.findUnique({
      where: { itemId_locationId_batch: { itemId, locationId, batch } },
    });

    let row;
    if (existing) {
      row = await prisma.inventory.update({
        where: { id: existing.id },
        data: { physicalQty: { increment: physicalQty } },
        include: { item: true, location: true },
      });
    } else {
      row = await prisma.inventory.create({
        data: { itemId, locationId, batch, physicalQty, reservedQty: 0 },
        include: { item: true, location: true },
      });
    }

    await prisma.inventoryTransaction.create({
      data: { inventoryId: row.id, type: "RECEIPT", quantity: physicalQty, refType: "MANUAL" },
    });

    res.status(201).json(serialize(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/inventory/:id/damage - Live Verification Change 1
router.post("/:id/damage", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer" });
  }
  try {
    const row = await markDamaged({ inventoryId: Number(req.params.id), quantity });
    const full = await prisma.inventory.findUnique({
      where: { id: row.id },
      include: { item: true, location: true },
    });
    res.json(serialize(full));
  } catch (err) {
    const status = err instanceof InsufficientStockError ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
