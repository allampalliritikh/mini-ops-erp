const express = require("express");
const prisma = require("../utils/prisma");
const { authenticate, authorize } = require("../middleware/auth");
const {
  dispatchTransfer,
  receiveTransfer,
  InsufficientStockError,
  DuplicateTransactionError,
} = require("../utils/inventoryService");

const router = express.Router();
router.use(authenticate);

// GET /api/transfers
router.get("/", async (req, res) => {
  const rows = await prisma.transfer.findMany({ include: { item: true }, orderBy: { id: "asc" } });
  res.json(rows);
});

// POST /api/transfers - request a transfer (Admin, Operations)
router.post("/", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  const { sourceLocationId, destinationLocationId, itemId, quantity } = req.body;

  if (!sourceLocationId || !destinationLocationId || !itemId || !quantity) {
    return res.status(400).json({
      error: "sourceLocationId, destinationLocationId, itemId and quantity are required",
    });
  }
  if (sourceLocationId === destinationLocationId) {
    return res.status(400).json({ error: "source and destination locations must differ" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer" });
  }

  const transfer = await prisma.transfer.create({
    data: { sourceLocationId, destinationLocationId, itemId, quantity, status: "REQUESTED" },
    include: { item: true },
  });
  res.status(201).json(transfer);
});

// POST /api/transfers/:id/dispatch - reduces source inventory (Test: cannot exceed available)
router.post("/:id/dispatch", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  try {
    const transfer = await dispatchTransfer({ transferId: Number(req.params.id) });
    res.json(transfer);
  } catch (err) {
    const status =
      err instanceof InsufficientStockError || err instanceof DuplicateTransactionError ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/transfers/:id/receive - increases destination inventory (Test: cannot double-receive)
// Body: { quantity? } - omit quantity to receive the full outstanding amount.
router.post("/:id/receive", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  try {
    const transfer = await receiveTransfer({
      transferId: Number(req.params.id),
      quantity: req.body.quantity,
    });
    res.json(transfer);
  } catch (err) {
    const status = err instanceof DuplicateTransactionError ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
