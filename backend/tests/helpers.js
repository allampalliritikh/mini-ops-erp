const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../src/utils/prisma");
const { JWT_SECRET } = require("../src/middleware/auth");

/** Wipes all tables between tests (SQLite test DB is disposable). */
async function resetDb() {
  await prisma.inventoryTransaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
}

async function createUser({ username, role, locationId = null }) {
  const passwordHash = await bcrypt.hash("password123", 4);
  return prisma.user.create({ data: { username, passwordHash, role, locationId } });
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, locationId: user.locationId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

module.exports = { resetDb, createUser, tokenFor, prisma };
