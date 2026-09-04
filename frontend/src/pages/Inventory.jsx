import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../AuthContext.jsx";

export default function Inventory() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ itemId: "", locationId: "", batch: "", physicalQty: "" });
  const [newItemForm, setNewItemForm] = useState({ name: "", category: "" });
  const [showNewItem, setShowNewItem] = useState(false);

  const canManage = user?.role === "ADMIN" || user?.role === "OPERATIONS";
  const isAdmin = user?.role === "ADMIN";

  async function loadAll() {
    try {
      const [inv, itemList, locList] = await Promise.all([
        api.get("/inventory"),
        api.get("/items"),
        api.get("/locations"),
      ]);
      setRows(inv);
      setItems(itemList);
      setLocations(locList);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleReceive(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/inventory", {
        itemId: Number(form.itemId),
        locationId: Number(form.locationId),
        batch: form.batch,
        physicalQty: Number(form.physicalQty),
      });
      setForm({ itemId: "", locationId: "", batch: "", physicalQty: "" });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddItem(e) {
    e.preventDefault();
    setError("");
    try {
      const created = await api.post("/items", {
        name: newItemForm.name,
        category: newItemForm.category,
      });
      setNewItemForm({ name: "", category: "" });
      setShowNewItem(false);
      await loadAll();
      // Pre-select the newly created item in the Receive Stock form.
      setForm((f) => ({ ...f, itemId: String(created.id) }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDamage(row) {
    const qty = window.prompt(`Mark how many units of "${row.item.name}" (${row.batch}) as damaged?`);
    if (!qty) return;
    setError("");
    try {
      await api.post(`/inventory/${row.id}/damage`, { quantity: Number(qty) });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1>Inventory</h1>
      {error && <div className="error-banner">{error}</div>}

      {isAdmin && (
        <div className="card">
          <h2>
            Items{" "}
            <button type="button" onClick={() => setShowNewItem((s) => !s)}>
              {showNewItem ? "Cancel" : "+ Add New Item"}
            </button>
          </h2>
          {showNewItem && (
            <form className="inline-form" onSubmit={handleAddItem}>
              <label>
                Name
                <input
                  value={newItemForm.name}
                  onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Category
                <input
                  value={newItemForm.category}
                  onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })}
                  required
                />
              </label>
              <button type="submit">Create Item</button>
            </form>
          )}
        </div>
      )}

      {canManage && (
        <div className="card">
          <h2>Receive Stock</h2>
          <form className="inline-form" onSubmit={handleReceive}>
            <label>
              Item
              <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label>
              Location
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required>
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>
              Batch
              <input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} required />
            </label>
            <label>
              Quantity
              <input type="number" min="1" value={form.physicalQty}
                onChange={(e) => setForm({ ...form, physicalQty: e.target.value })} required />
            </label>
            <button type="submit">Receive</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Stock Levels</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th><th>Category</th><th>Location</th><th>Batch</th>
              <th>Physical</th><th>Reserved</th><th>Available</th>{canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.item.name}</td>
                <td>{r.item.category}</td>
                <td>{r.location.name}</td>
                <td>{r.batch}</td>
                <td>{r.physicalQty}</td>
                <td>{r.reservedQty}</td>
                <td>
                  <span className={`badge ${r.availableQty > 0 ? "ok" : "bad"}`}>{r.availableQty}</span>
                </td>
                {canManage && (
                  <td><button className="danger" onClick={() => handleDamage(r)}>Damage</button></td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}>No inventory yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}