import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../AuthContext.jsx";

export default function Transfers() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ itemId: "", sourceLocationId: "", destinationLocationId: "", quantity: "" });

  const canManage = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  async function loadAll() {
    try {
      const [transfers, itemList, locList] = await Promise.all([
        api.get("/transfers"),
        api.get("/items"),
        api.get("/locations"),
      ]);
      setRows(transfers);
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
      await api.post("/transfers", {
        itemId: Number(form.itemId),
        sourceLocationId: Number(form.sourceLocationId),
        destinationLocationId: Number(form.destinationLocationId),
        quantity: Number(form.quantity),
      });
      setForm({ itemId: "", sourceLocationId: "", destinationLocationId: "", quantity: "" });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function dispatch(id) {
    setError("");
    try {
      await api.post(`/transfers/${id}/dispatch`, {});
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function receive(t) {
    const outstanding = t.quantity - t.receivedQty;
    const input = window.prompt(`Receive how many units? (outstanding: ${outstanding})`, outstanding);
    if (!input) return;
    setError("");
    try {
      await api.post(`/transfers/${t.id}/receive`, { quantity: Number(input) });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function locationName(id) { return locations.find((l) => l.id === id)?.name || id; }

  return (
    <div className="container">
      <h1>Internal Transfers</h1>
      {error && <div className="error-banner">{error}</div>}

      {canManage && (
        <div className="card">
          <h2>Request Transfer</h2>
          <form className="inline-form" onSubmit={handleCreate}>
            <label>
              Item
              <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label>
              From
              <select value={form.sourceLocationId} onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })} required>
                <option value="">Source location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>
              To
              <select value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} required>
                <option value="">Destination location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>
              Quantity
              <input type="number" min="1" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </label>
            <button type="submit">Request</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>All Transfers</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Item</th><th>From</th><th>To</th><th>Qty</th><th>Received</th><th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.item.name}</td>
                <td>{locationName(t.sourceLocationId)}</td>
                <td>{locationName(t.destinationLocationId)}</td>
                <td>{t.quantity}</td>
                <td>{t.receivedQty}</td>
                <td>
                  <span className={`badge ${t.status === "RECEIVED" ? "ok" : t.status === "DISPATCHED" ? "warn" : "bad"}`}>
                    {t.status}
                  </span>
                </td>
                {canManage && (
                  <td>
                    {t.status === "REQUESTED" && <button onClick={() => dispatch(t.id)}>Dispatch</button>}
                    {t.status === "DISPATCHED" && <button onClick={() => receive(t)}>Receive</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}>No transfers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
