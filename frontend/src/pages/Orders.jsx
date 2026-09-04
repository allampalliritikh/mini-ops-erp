import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../AuthContext.jsx";

export default function Orders() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ itemId: "", locationId: "", quantity: "" });

  const canManage = user?.role === "ADMIN" || user?.role === "SALES";

  async function loadAll() {
    try {
      const [orders, itemList, locList] = await Promise.all([
        api.get("/orders"),
        api.get("/items"),
        api.get("/locations"),
      ]);
      setRows(orders);
      setItems(itemList);
      setLocations(locList);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/orders", {
        itemId: Number(form.itemId),
        locationId: Number(form.locationId),
        quantity: Number(form.quantity),
      });
      setForm({ itemId: "", locationId: "", quantity: "" });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancel(id) {
    setError("");
    try {
      await api.post(`/orders/${id}/cancel`, {});
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function locationName(id) { return locations.find((l) => l.id === id)?.name || id; }

  return (
    <div className="container">
      <h1>Customer Orders</h1>
      {error && <div className="error-banner">{error}</div>}

      {canManage && (
        <div className="card">
          <h2>Create Order &amp; Reserve Stock</h2>
          <form className="inline-form" onSubmit={handleCreate}>
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
              Quantity
              <input type="number" min="1" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </label>
            <button type="submit">Reserve</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>All Orders</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Item</th><th>Location</th><th>Qty</th><th>Sales User</th><th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.item.name}</td>
                <td>{locationName(o.locationId)}</td>
                <td>{o.quantity}</td>
                <td>{o.salesUser.username}</td>
                <td>
                  <span className={`badge ${o.status === "RESERVED" ? "ok" : o.status === "CANCELLED" ? "bad" : "warn"}`}>
                    {o.status}
                  </span>
                </td>
                {canManage && (
                  <td>
                    {o.status === "RESERVED" && <button className="danger" onClick={() => cancel(o.id)}>Cancel</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7}>No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
