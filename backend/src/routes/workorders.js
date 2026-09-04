const express = require("express");
const prisma = require("../utils/prisma");
const { authenticate, authorize } = require("../middleware/auth");
const { available } = require("../utils/inventoryService");

const router = express.Router();
router.use(authenticate);

// GET /api/work-orders
router.get("/", async (req, res) => {
  const rows = await prisma.workOrder.findMany({
    include: { item: true, assignedUser: { select: { id: true, username: true } } },
    orderBy: { id: "asc" },
  });

  // Attach a live stock-check (available vs required) to every work order.
  const withStockCheck = await Promise.all(
    rows.map(async (wo) => {
      const invRows = await prisma.inventory.findMany({
        where: { itemId: wo.itemId, locationId: wo.locationId },
      });
      const availableAtLocation = invRows.reduce((sum, r) => sum + available(r), 0);
      const shortage = Math.max(0, wo.requiredQty - availableAtLocation);
      return { ...wo, stockCheck: { availableAtLocation, shortage } };
    })
  );

  res.json(withStockCheck);
});

// POST /api/work-orders - Admin only
router.post("/", authorize("ADMIN"), async (req, res) => {
  const { locationId, itemId, requiredQty, assignedUserId } = req.body;

  if (!locationId || !itemId || !requiredQty || !assignedUserId) {
    return res
      .status(400)
      .json({ error: "locationId, itemId, requiredQty and assignedUserId are required" });
  }
  if (!Number.isInteger(requiredQty) || requiredQty <= 0) {
    return res.status(400).json({ error: "requiredQty must be a positive integer" });
  }

  const workOrder = await prisma.workOrder.create({
    data: { locationId, itemId, requiredQty, assignedUserId, status: "ASSIGNED" },
    include: { item: true, assignedUser: { select: { id: true, username: true } } },
  });

  const invRows = await prisma.inventory.findMany({ where: { itemId, locationId } });
  const availableAtLocation = invRows.reduce((sum, r) => sum + available(r), 0);
  const shortage = Math.max(0, requiredQty - availableAtLocation);

  res.status(201).json({ ...workOrder, stockCheck: { availableAtLocation, shortage } });
});

// PATCH /api/work-orders/:id/status - Admin, Operations
router.patch("/:id/status", authorize("ADMIN", "OPERATIONS"), async (req, res) => {
  const { status } = req.body;
  const valid = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
  }
  try {
    const wo = await prisma.workOrder.update({
      where: { id: Number(req.params.id) },
      data: { status },
    });
    res.json(wo);
  } catch (err) {
    res.status(404).json({ error: "Work order not found" });
  }
});

module.exports = router;
