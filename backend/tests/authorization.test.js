const request = require("supertest");
const app = require("../src/app");
const { resetDb, createUser, tokenFor, prisma } = require("./helpers");

describe("Test 5: Unauthorized user cannot perform restricted operation", () => {
  let salesUser, opsUser, location, item;

  beforeEach(async () => {
    await resetDb();
    salesUser = await createUser({ username: "sales1", role: "SALES" });
    opsUser = await createUser({ username: "ops1", role: "OPERATIONS" });
    location = await prisma.location.create({ data: { name: "Loc1" } });
    item = await prisma.item.create({ data: { name: "Widget", category: "General" } });
  });

  it("blocks a SALES user from creating a Work Order (Admin-only)", async () => {
    const res = await request(app)
      .post("/api/work-orders")
      .set("Authorization", `Bearer ${tokenFor(salesUser)}`)
      .send({ locationId: location.id, itemId: item.id, requiredQty: 10, assignedUserId: opsUser.id });

    expect(res.status).toBe(403);
  });

  it("blocks requests with no auth token at all", async () => {
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(401);
  });

  it("blocks an OPERATIONS user from creating a Customer Order (Sales-only)", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${tokenFor(opsUser)}`)
      .send({ itemId: item.id, locationId: location.id, quantity: 5 });

    expect(res.status).toBe(403);
  });
});
