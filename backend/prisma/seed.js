const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const [warehouseA, warehouseB] = await Promise.all([
    prisma.location.upsert({ where: { name: "Warehouse A" }, update: {}, create: { name: "Warehouse A" } }),
    prisma.location.upsert({ where: { name: "Warehouse B" }, update: {}, create: { name: "Warehouse B" } }),
  ]);

  const [bolt, panel] = await Promise.all([
    prisma.item.create({ data: { name: "Steel Bolt M8", category: "Hardware" } }),
    prisma.item.create({ data: { name: "Aluminium Panel", category: "Raw Material" } }),
  ]);

  async function upsertUser(username, password, role, locationId = null) {
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, passwordHash, role, locationId },
    });
  }

  const admin = await upsertUser("admin", "Admin@123", "ADMIN");
  const opsUser = await upsertUser("ops_user", "Ops@123", "OPERATIONS", warehouseA.id);
  const salesUser = await upsertUser("sales_user", "Sales@123", "SALES", warehouseA.id);

  await prisma.inventory.upsert({
    where: { itemId_locationId_batch: { itemId: bolt.id, locationId: warehouseA.id, batch: "BATCH-1" } },
    update: {},
    create: { itemId: bolt.id, locationId: warehouseA.id, batch: "BATCH-1", physicalQty: 100, reservedQty: 0 },
  });
  await prisma.inventory.upsert({
    where: { itemId_locationId_batch: { itemId: panel.id, locationId: warehouseB.id, batch: "BATCH-1" } },
    update: {},
    create: { itemId: panel.id, locationId: warehouseB.id, batch: "BATCH-1", physicalQty: 60, reservedQty: 0 },
  });

  console.log("Seed complete.");
  console.log("Login with:");
  console.log("  admin      / Admin@123   (ADMIN)");
  console.log("  ops_user   / Ops@123     (OPERATIONS, Warehouse A)");
  console.log("  sales_user / Sales@123   (SALES, Warehouse A)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
