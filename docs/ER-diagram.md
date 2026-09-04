# ER Diagram - Mini Operations ERP

Paste this into https://mermaid.live to render it, or view it directly in GitHub.

```mermaid
erDiagram
    USER ||--o{ WORK_ORDER : "assigned to"
    USER ||--o{ ORDER : "creates"
    USER }o--|| LOCATION : "scoped to (optional)"

    LOCATION ||--o{ INVENTORY : "stores"
    LOCATION ||--o{ USER : "restricts"

    ITEM ||--o{ INVENTORY : "stocked as"
    ITEM ||--o{ WORK_ORDER : "required by"
    ITEM ||--o{ TRANSFER : "moved as"
    ITEM ||--o{ ORDER : "ordered as"

    INVENTORY ||--o{ INVENTORY_TRANSACTION : "audited by"

    USER {
        int id PK
        string username
        string passwordHash
        enum role
        int locationId FK
    }
    LOCATION {
        int id PK
        string name
    }
    ITEM {
        int id PK
        string name
        string category
    }
    INVENTORY {
        int id PK
        int itemId FK
        int locationId FK
        string batch
        int physicalQty
        int reservedQty
    }
    INVENTORY_TRANSACTION {
        int id PK
        int inventoryId FK
        enum type
        int quantity
        string refType
        int refId
    }
    WORK_ORDER {
        int id PK
        int locationId FK
        int itemId FK
        int requiredQty
        int assignedUserId FK
        enum status
    }
    TRANSFER {
        int id PK
        int sourceLocationId FK
        int destinationLocationId FK
        int itemId FK
        int quantity
        int receivedQty
        enum status
    }
    ORDER {
        int id PK
        int itemId FK
        int locationId FK
        int quantity
        enum status
        int salesUserId FK
    }
```

## Key design notes

- **Available quantity** is never stored — it is always derived as `physicalQty - reservedQty`,
  so it can never drift out of sync.
- **`InventoryTransaction`** is an append-only audit log. Its unique constraint on
  `(refType, refId, type)` is what makes dispatch/receive/reserve/release operations
  idempotent — the same source event can never be applied to stock twice, which is how
  Test 4 ("same transfer cannot be received twice") is enforced at the database level.
- **`Inventory`** is unique per `(itemId, locationId, batch)`, which prevents duplicate
  inventory rows for the same batch and lets each location/batch be tracked independently.
