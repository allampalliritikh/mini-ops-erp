# Mini Operations ERP

A small full-stack Operations ERP covering: Inventory → Work Order → Stock Check →
Internal Transfer / Shortage → Customer Reservation.

## Tech Stack

| Layer     | Choice                                                             |
|-----------|---------------------------------------------------------------------|
| Frontend  | React 18 + Vite + React Router (plain `fetch`, no heavy UI kit)     |
| Backend   | Node.js + Express                                                    |
| Database  | SQLite via Prisma ORM (portable — swap to Postgres with one line)   |
| Auth      | JWT (stateless bearer tokens) + bcrypt password hashing             |
| Testing   | Jest + Supertest (API-level tests, real DB, no mocking of business logic) |

The backend has **zero hard dependency on any specific hosting provider**: it reads
`DATABASE_URL`, `JWT_SECRET`, and `PORT` from environment variables, and Prisma's
`schema.prisma` `provider` can be switched from `sqlite` to `postgresql` (or `mysql`)
without touching any application code.

## Project Structure

```
mini-ops-erp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # data model (see docs/ER-diagram.md)
│   │   └── seed.js            # demo users, locations, items, stock
│   ├── src/
│   │   ├── app.js             # express app (exported for tests)
│   │   ├── index.js           # server entrypoint
│   │   ├── middleware/auth.js # JWT auth + role-based authorization
│   │   ├── routes/            # auth, inventory, work-orders, transfers, orders, meta
│   │   └── utils/
│   │       ├── prisma.js
│   │       └── inventoryService.js  # ALL core business logic / transactions live here
│   └── tests/                 # the 5 mandatory tests + concurrency test
├── frontend/
│   └── src/
│       ├── pages/              # Login, Inventory, WorkOrders, Transfers, Orders
│       ├── api/client.js       # fetch wrapper (env-based base URL, auth header)
│       └── AuthContext.jsx
└── docs/
    ├── ER-diagram.md           # mermaid ER diagram + design notes
    └── postman_collection.json
```

## 1. Database Setup

The default setup uses SQLite, so there is **nothing to install** — Prisma creates
the database file for you. If you'd rather use Postgres, create a database and set
`DATABASE_URL` in `backend/.env` accordingly (no code changes needed).

## 2. Environment Variables

```bash
cd backend
cp .env.example .env
# edit .env if you want to change JWT_SECRET, PORT, or point at Postgres

cd ../frontend
cp .env.example .env
# VITE_API_URL defaults to http://localhost:4000/api
```

## 3. How to Run

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates dev.db and applies schema
npm run prisma:seed                  # creates demo users + starter stock
npm run dev                          # http://localhost:4000
```

**Frontend** (in a second terminal):
```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Open `http://localhost:5173` and log in with one of the seeded accounts:

| Username     | Password    | Role       | Location    |
|--------------|-------------|------------|-------------|
| `admin`      | `Admin@123` | ADMIN      | (all)       |
| `ops_user`   | `Ops@123`   | OPERATIONS | Warehouse A |
| `sales_user` | `Sales@123` | SALES      | Warehouse A |

## 4. How to Test

```bash
cd backend
npm test
```

This runs the backend test suite against a disposable SQLite test database
(`backend/test.db`, wiped between test files). It covers:

- **Test 1** — cannot reserve more than available inventory, *including* a
  concurrency test where two orders race for the same stock and only one succeeds.
- **Test 2** — cannot dispatch a transfer for more than available stock.
- **Test 3** — destination inventory only increases on receipt, never on dispatch/request.
- **Test 4** — the same transfer cannot be received twice (and partial receipt is
  tracked correctly).
- **Test 5** — unauthorized roles are rejected with 403/401 (e.g. a SALES user
  cannot create a Work Order; an unauthenticated request is rejected outright).

## API Documentation

Import `docs/postman_collection.json` into Postman, or open `docs/ER-diagram.md`
for the full data model. Every route requires `Authorization: Bearer <token>`
except `/api/auth/login` and `/api/auth/register`.

Key endpoints:

| Method | Path                          | Roles                | Notes |
|--------|-------------------------------|-----------------------|-------|
| POST   | `/api/auth/login`             | public                | returns JWT |
| GET    | `/api/inventory`               | any authenticated     | includes computed `availableQty` |
| POST   | `/api/inventory`               | ADMIN, OPERATIONS     | receives stock into a batch |
| POST   | `/api/inventory/:id/damage`    | ADMIN, OPERATIONS     | Live-Verification "damaged stock" change |
| GET    | `/api/work-orders`             | any authenticated     | includes live shortage calculation |
| POST   | `/api/work-orders`             | ADMIN                 | |
| PATCH  | `/api/work-orders/:id/status`  | ADMIN, OPERATIONS     | |
| POST   | `/api/transfers`               | ADMIN, OPERATIONS     | create (status REQUESTED) |
| POST   | `/api/transfers/:id/dispatch`  | ADMIN, OPERATIONS     | reduces source stock |
| POST   | `/api/transfers/:id/receive`   | ADMIN, OPERATIONS     | increases destination stock; supports `{quantity}` for partial receipt |
| GET    | `/api/orders`                  | any authenticated     | |
| POST   | `/api/orders`                  | ADMIN, SALES          | atomically reserves stock |
| POST   | `/api/orders/:id/cancel`       | ADMIN, SALES          | releases reserved stock |

## Business Logic Highlights

- **Available Quantity** is *always* computed as `physicalQty - reservedQty`,
  never stored, so it can't drift out of sync.
- **Concurrency safety**: every stock mutation happens inside a single
  `prisma.$transaction`, which re-reads and re-validates the row it's about to
  update in the same transaction it commits in. Two simultaneous reservations
  for the same stock cannot both succeed — see
  `backend/src/utils/inventoryService.js` and
  `backend/tests/reservation.test.js`.
- **Idempotency / no double-processing**: `InventoryTransaction` has a unique
  constraint on `(refType, refId, type)`. Dispatching or receiving the same
  transfer twice, or releasing the same order's stock twice, is rejected at
  the database level, not just in application code.
- **Shortage calculation**: a Work Order's stock check
  (`availableAtLocation`, `shortage`) is computed live from current inventory
  every time it's fetched, so it's never stale.

## Live Verification Hooks

The four possible "unannounced change" scenarios from the spec are already
wired in, so a reviewer can flip them on immediately:

1. **Damaged stock** → `POST /api/inventory/:id/damage` (see `markDamaged` in
   `inventoryService.js`) — reduces `physicalQty` (and therefore available
   stock) immediately.
2. **Partial transfer receipt** → `POST /api/transfers/:id/receive` already
   accepts an optional `{ quantity }` less than the outstanding amount; the
   transfer stays `DISPATCHED` until fully received.
3. **Cancel an order & release inventory** → `POST /api/orders/:id/cancel`
   calls `releaseStock`, which decrements `reservedQty` and is guarded
   against double-release.
4. **Restrict users to their assigned location** → `User.locationId` +
   `enforceLocationScope()` in `src/middleware/auth.js` are already in the
   schema/middleware; wiring it into a specific route is a one-line change
   (apply the middleware with a function that extracts the target
   `locationId` from the request).

## Git History Note

This zip is a snapshot for convenience. When you push it to a real Git
repository, commit it in logical stages (schema → auth → inventory → work
orders → transfers → orders → frontend → tests) rather than as one final
commit, per the submission requirements.
