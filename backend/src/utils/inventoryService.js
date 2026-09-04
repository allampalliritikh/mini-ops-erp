const prisma = require("./prisma");

/**
 * All mutating stock operations go through prisma.$transaction, and every
 * write re-reads the row and re-checks the invariant (reservedQty <= physicalQty)
 * inside the SAME transaction. SQLite (and Postgres, with the default
 * "read committed" + our re-check pattern) serializes writers on a table, so two
 * concurrent requests cannot both pass the check and both commit an over-reservation:
 * whichever transaction commits second re-reads the now-updated row and fails
 * the check. This is what "Solve this correctly at backend/database level" requires
 * (see tests/reservation.test.js for two concurrent reservations racing).
 */

class InsufficientStockError extends Error {
  constructor(message) {
    super(message);
    this.name = "InsufficientStockError";
    this.statusCode = 409;
  }
}

class DuplicateTransactionError extends Error {
  constructor(message) {
    super(message);
    this.name = "DuplicateTransactionError";
    this.statusCode = 409;
  }
}

function available(inv) {
  return inv.physicalQty - inv.reservedQty;
}

/**
 * Has this (refType, refId, type) event already been recorded at all (on any
 * inventory row)? Used as an idempotency guard before applying an event that
 * must never be double-applied (dispatch, receive, release). We use findFirst
 * rather than findUnique here because the DB-level unique constraint is on
 * (inventoryId, refType, refId, type) - one event can legitimately span
 * multiple inventory batches/rows, so refType+refId+type alone is not a
 * lookup key, just an existence check.
 */
async function eventAlreadyApplied(tx, { refType, refId, type }) {
  const existing = await tx.inventoryTransaction.findFirst({
    where: { refType, refId, type },
  });
  return Boolean(existing);
}

/**
 * Core reservation logic, operating inside a caller-supplied transaction.
 * Exported separately so routes (e.g. order creation) can run "create order"
 * and "reserve stock" as ONE atomic unit - if reservation fails, the order
 * row itself never commits, so there's nothing to roll back manually and no
 * risk of an id being reused while stale related rows still reference it.
 */
async function reserveStockInTx(tx, { itemId, locationId, quantity, refType, refId }) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  // Aggregate all batches of this item at this location.
  const rows = await tx.inventory.findMany({ where: { itemId, locationId } });
  const totalAvailable = rows.reduce((sum, r) => sum + available(r), 0);

  if (totalAvailable < quantity) {
    throw new InsufficientStockError(
      `Cannot reserve ${quantity}: only ${totalAvailable} available`
    );
  }

  // Allocate greedily across batches (oldest/first row first). A single
  // reservation can touch several batches, each getting its own
  // InventoryTransaction row (inventoryId is part of the unique key so
  // these don't collide with each other).
  let remaining = quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, available(row));
    if (take <= 0) continue;

    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { reservedQty: { increment: take } },
    });
    if (updated.reservedQty > updated.physicalQty) {
      // Safety net: should be unreachable given the check above, but guards
      // against any race the aggregate check didn't anticipate.
      throw new InsufficientStockError("Reservation would exceed available stock");
    }

    await tx.inventoryTransaction.create({
      data: { inventoryId: row.id, type: "RESERVE", quantity: take, refType, refId },
    });

    remaining -= take;
  }

  return { reserved: quantity };
}

/** Reserve stock for a customer order, in its own standalone transaction. */
async function reserveStock(params) {
  return prisma.$transaction((tx) => reserveStockInTx(tx, params));
}

/** Release a previously reserved quantity (e.g. order cancellation). */
async function releaseStock({ itemId, locationId, quantity, refType, refId }) {
  return prisma.$transaction(async (tx) => {
    if (await eventAlreadyApplied(tx, { refType, refId, type: "RELEASE" })) {
      throw new DuplicateTransactionError("Stock for this reference was already released");
    }

    const rows = await tx.inventory.findMany({
      where: { itemId, locationId, reservedQty: { gt: 0 } },
    });

    let remaining = quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      const give = Math.min(remaining, row.reservedQty);
      if (give <= 0) continue;

      await tx.inventory.update({
        where: { id: row.id },
        data: { reservedQty: { decrement: give } },
      });

      await tx.inventoryTransaction.create({
        data: { inventoryId: row.id, type: "RELEASE", quantity: give, refType, refId },
      });

      remaining -= give;
    }
    return { released: quantity - remaining };
  });
}

/** Dispatch a transfer: reduces source inventory immediately. */
async function dispatchTransfer({ transferId }) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "REQUESTED") {
      throw new Error(`Transfer must be REQUESTED to dispatch (currently ${transfer.status})`);
    }

    if (await eventAlreadyApplied(tx, { refType: "TRANSFER", refId: transferId, type: "TRANSFER_OUT" })) {
      throw new DuplicateTransactionError("Transfer already dispatched");
    }

    const rows = await tx.inventory.findMany({
      where: { itemId: transfer.itemId, locationId: transfer.sourceLocationId },
    });
    const totalAvailable = rows.reduce((sum, r) => sum + available(r), 0);
    if (totalAvailable < transfer.quantity) {
      throw new InsufficientStockError(
        `Cannot transfer ${transfer.quantity}: only ${totalAvailable} available at source`
      );
    }

    let remaining = transfer.quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, available(row));
      if (take <= 0) continue;

      await tx.inventory.update({
        where: { id: row.id },
        data: { physicalQty: { decrement: take } },
      });
      await tx.inventoryTransaction.create({
        data: {
          inventoryId: row.id,
          type: "TRANSFER_OUT",
          quantity: take,
          refType: "TRANSFER",
          refId: transferId,
        },
      });
      remaining -= take;
    }

    return tx.transfer.update({
      where: { id: transferId },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
  });
}

/**
 * Receive a transfer at the destination. Supports partial receipt: pass
 * `quantity` less than the outstanding amount to receive part of it; the
 * transfer stays DISPATCHED until fully received (Live Verification Change 2).
 * Increasing destination inventory only ever happens here, never on dispatch
 * or request (Test 3), and a fully-received transfer cannot be received again (Test 4).
 */
async function receiveTransfer({ transferId, quantity, batch = "TRANSFER" }) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status === "RECEIVED") {
      throw new DuplicateTransactionError("Transfer has already been fully received");
    }
    if (transfer.status !== "DISPATCHED") {
      throw new Error(`Transfer must be DISPATCHED to receive (currently ${transfer.status})`);
    }

    const outstanding = transfer.quantity - transfer.receivedQty;
    const qty = quantity == null ? outstanding : quantity;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("quantity must be a positive integer");
    }
    if (qty > outstanding) {
      throw new Error(`Cannot receive ${qty}: only ${outstanding} outstanding on this transfer`);
    }

    // Idempotency guard per partial-receipt event using a composite refId
    // (transferId + how much had been received so far identifies this exact receipt event).
    const txnRefId = Number(`${transferId}${String(transfer.receivedQty).padStart(6, "0")}`);
    if (await eventAlreadyApplied(tx, { refType: "TRANSFER", refId: txnRefId, type: "TRANSFER_IN" })) {
      throw new DuplicateTransactionError("This receipt was already processed");
    }

    let inv = await tx.inventory.findUnique({
      where: {
        itemId_locationId_batch: {
          itemId: transfer.itemId,
          locationId: transfer.destinationLocationId,
          batch,
        },
      },
    });
    if (!inv) {
      inv = await tx.inventory.create({
        data: {
          itemId: transfer.itemId,
          locationId: transfer.destinationLocationId,
          batch,
          physicalQty: 0,
          reservedQty: 0,
        },
      });
    }

    await tx.inventory.update({
      where: { id: inv.id },
      data: { physicalQty: { increment: qty } },
    });

    await tx.inventoryTransaction.create({
      data: {
        inventoryId: inv.id,
        type: "TRANSFER_IN",
        quantity: qty,
        refType: "TRANSFER",
        refId: txnRefId,
      },
    });

    const newReceivedQty = transfer.receivedQty + qty;
    const fullyReceived = newReceivedQty >= transfer.quantity;

    return tx.transfer.update({
      where: { id: transferId },
      data: {
        receivedQty: newReceivedQty,
        status: fullyReceived ? "RECEIVED" : "DISPATCHED",
        receivedAt: fullyReceived ? new Date() : transfer.receivedAt,
      },
    });
  });
}

/** Live Verification Change 1: damaged stock reduces available stock immediately. */
async function markDamaged({ inventoryId, quantity }) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { id: inventoryId } });
    if (!inv) throw new Error("Inventory row not found");
    if (quantity > available(inv)) {
      throw new InsufficientStockError("Cannot damage more than available stock");
    }
    await tx.inventoryTransaction.create({
      data: { inventoryId, type: "DAMAGE", quantity, refType: "MANUAL", refId: null },
    });
    return tx.inventory.update({
      where: { id: inventoryId },
      data: { physicalQty: { decrement: quantity } },
    });
  });
}

module.exports = {
  available,
  reserveStock,
  reserveStockInTx,
  releaseStock,
  dispatchTransfer,
  receiveTransfer,
  markDamaged,
  InsufficientStockError,
  DuplicateTransactionError,
};