const request = require("supertest");
const app = require("../src/app");
const { resetDb, createUser, tokenFor, prisma } = require("./helpers");

describe("Test 1: Cannot reserve more than available inventory", () => {
  let sales, location, item;

  beforeEach(async () => {
    await resetDb();
    sales = await createUser({ username: "sales1", role: "SALES" });
    location = await prisma.location.create({ data: { name: "Loc1" } });
    item = await prisma.item.create({ data: { name: "Widget", category: "General" } });
    await prisma.inventory.create({
      data: { itemId: item.id, locationId: location.id, batch: "B1", physicalQty: 100, reservedQty: 0 },
    });
  });

  it("rejects a single order that exceeds available stock", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${tokenFor(sales)}`)
      .send({ itemId: item.id, locationId: location.id, quantity: 150 });

    expect(res.status).toBe(409);
    const inv = await prisma.inventory.findFirst({ where: { itemId: item.id } });
    expect(inv.reservedQty).toBe(0);
  });

  it("prevents two concurrent orders from together over-reserving stock", async () => {
    // Available = 100. User A reserves 80, User B reserves 50 - only one may succeed.
    const [resA, resB] = await Promise.all([
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${tokenFor(sales)}`)
        .send({ itemId: item.id, locationId: location.id, quantity: 80 }),
      request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${tokenFor(sales)}`)
        .send({ itemId: item.id, locationId: location.id, quantity: 50 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const inv = await prisma.inventory.findFirst({ where: { itemId: item.id } });
    expect(inv.reservedQty).toBeLessThanOrEqual(inv.physicalQty);
    expect(inv.reservedQty).toBe(80); // only the successful reservation applied
  });
});
