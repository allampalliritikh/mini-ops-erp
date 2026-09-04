const express = require("express");
const prisma = require("../utils/prisma");
const { authenticate, authorize } = require("../middleware/auth");
const {
  reserveStockInTx,
  releaseStock,
  InsufficientStockError,
  DuplicateTransactionError,
} = require("../utils/inventoryService");

const router = express.Router();
router.use(authenticate);

// GET /api/orders
router.get("/", async (req, res) => {
  const rows = await prisma.order.findMany({
    include: { item: true, salesUser: { select: { id: true, username: true } } },
    orderBy: { id: "asc" },
  });
  res.json(rows);
});

// POST /api/orders - Sales user creates an order and reserves stock atomically.
// Test 1: two concurrent orders can never together reserve more than available.
router.post("/", authorize("ADMIN", "SALES"), async (req, res) => {
  const { itemId, locationId, quantity } = req.body;

  if (!itemId || !locationId || !quantity) {
    return res.status(400).json({ error: "itemId, locationId and quantity are required" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer" });
  }

  try {
    // Create the order AND reserve its stock inside a single transaction.
    // If reservation fails (insufficient stock, race with another order),
    // the whole transaction - including the order row itself - rolls back,
    // so there is never a stray/half-committed order to clean up.
    const orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: { itemId, locationId, quantity, salesUserId: req.user.id, status: "RESERVED" },
      });
      await reserveStockInTx(tx, { itemId, locationId, quantity, refType: "ORDER", refId: order.id });
      return order.id;
    });

    const full = await prisma.order.findUnique({
      where: { id: orderId },
      include: { item: true, salesUser: { select: { id: true, username: true } } },
    });
    res.status(201).json(full);
  } catch (err) {
    const status = err instanceof InsufficientStockError ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/orders/:id/cancel - Live Verification Change 3: release reserved inventory
router.post("/:id/cancel", authorize("ADMIN", "SALES"), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "CANCELLED") {
      return res.status(409).json({ error: "Order is already cancelled" });
    }

    await releaseStock({
      itemId: order.itemId,
      locationId: order.locationId,
      quantity: order.quantity,
      refType: "ORDER",
      refId: order.id,
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    res.json(updated);
  } catch (err) {
    const status = err instanceof DuplicateTransactionError ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;