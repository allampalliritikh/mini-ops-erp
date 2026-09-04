const request = require("supertest");
const app = require("../src/app");
const { resetDb, createUser, tokenFor, prisma } = require("./helpers");

describe("Transfer tests", () => {
  let ops, source, destination, item;

  beforeEach(async () => {
    await resetDb();
    ops = await createUser({ username: "ops1", role: "OPERATIONS" });
    source = await prisma.location.create({ data: { name: "Source" } });
    destination = await prisma.location.create({ data: { name: "Destination" } });
    item = await prisma.item.create({ data: { name: "Widget", category: "General" } });
    await prisma.inventory.create({
      data: { itemId: item.id, locationId: source.id, batch: "B1", physicalQty: 50, reservedQty: 0 },
    });
  });

  it("Test 2: cannot transfer more than available inventory", async () => {
    const create = await request(app)
      .post("/api/transfers")
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({ sourceLocationId: source.id, destinationLocationId: destination.id, itemId: item.id, quantity: 999 });
    expect(create.status).toBe(201);

    const dispatch = await request(app)
      .post(`/api/transfers/${create.body.id}/dispatch`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`);

    expect(dispatch.status).toBe(409);
  });

  it("Test 3: destination stock increases only after transfer receipt", async () => {
    const create = await request(app)
      .post("/api/transfers")
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({ sourceLocationId: source.id, destinationLocationId: destination.id, itemId: item.id, quantity: 20 });

    const beforeDispatch = await prisma.inventory.findMany({ where: { locationId: destination.id } });
    expect(beforeDispatch.length).toBe(0);

    await request(app)
      .post(`/api/transfers/${create.body.id}/dispatch`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`);

    // Source reduced, destination still untouched.
    const srcInv = await prisma.inventory.findFirst({ where: { locationId: source.id } });
    expect(srcInv.physicalQty).toBe(30);
    const afterDispatch = await prisma.inventory.findMany({ where: { locationId: destination.id } });
    expect(afterDispatch.length).toBe(0);

    await request(app)
      .post(`/api/transfers/${create.body.id}/receive`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({});

    const destInv = await prisma.inventory.findFirst({ where: { locationId: destination.id } });
    expect(destInv.physicalQty).toBe(20);
  });

  it("Test 4: same transfer cannot be received twice", async () => {
    const create = await request(app)
      .post("/api/transfers")
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({ sourceLocationId: source.id, destinationLocationId: destination.id, itemId: item.id, quantity: 10 });

    await request(app)
      .post(`/api/transfers/${create.body.id}/dispatch`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`);

    const first = await request(app)
      .post(`/api/transfers/${create.body.id}/receive`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/transfers/${create.body.id}/receive`)
      .set("Authorization", `Bearer ${tokenFor(ops)}`)
      .send({});
    expect(second.status).toBe(409);

    const destInv = await prisma.inventory.findFirst({ where: { locationId: destination.id } });
    expect(destInv.physicalQty).toBe(10); // not doubled
  });
});
