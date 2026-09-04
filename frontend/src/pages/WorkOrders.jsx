import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../AuthContext.jsx";

export default function WorkOrders() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ itemId: "", locationId: "", requiredQty: "", assignedUserId: "" });

  const isAdmin = user?.role === "ADMIN";
  const canUpdateStatus = user?.role === "ADMIN" || user?.role === "OPERATIONS";

  async function loadAll() {
    try {
      const calls = [api.get("/work-orders"), api.get("/items"), api.get("/locations")];
      if (isAdmin) calls.push(api.get("/users"));
      const [wo, itemList, locList, userList] = await Promise.all(calls);
      setRows(wo);
      setItems(itemList);
      setLocations(locList);
      if (userList) setUsers(userList);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/work-orders", {
        itemId: Number(form.itemId),
        locationId: Number(form.locationId),
        requiredQty: Number(form.requiredQty),
        assignedUserId: Number(form.assignedUserId),
      });
      setForm({ itemId: "", locationId: "", requiredQty: "", assignedUserId: "" });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateStatus(id, status) {
    setError("");
    try {
      await api.patch(`/work-orders/${id}/status`, { status });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <h1>Work Orders</h1>
      {error && <div className="error-banner">{error}</div>}

      {isAdmin && (
        <div className="card">
          <h2>Create Work Order</h2>
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
              Required Qty
              <input type="number" min="1" value={form.requiredQty}
                onChange={(e) => setForm({ ...form, requiredQty: e.target.value })} required />
            </label>
            <label>
              Assigned User
              <select value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })} required>
                <option value="">Select user</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </label>
            <button type="submit">Create</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>All Work Orders</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Item</th><th>Required</th><th>Available</th><th>Shortage</th>
              <th>Assigned</th><th>Status</th>{canUpdateStatus && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((wo) => (
              <tr key={wo.id}>
                <td>{wo.id}</td>
                <td>{wo.item.name}</td>
                <td>{wo.requiredQty}</td>
                <td>{wo.stockCheck.availableAtLocation}</td>
                <td>
                  <span className={`badge ${wo.stockCheck.shortage > 0 ? "bad" : "ok"}`}>
                    {wo.stockCheck.shortage}
                  </span>
                </td>
                <td>{wo.assignedUser.username}</td>
                <td>{wo.status}</td>
                {canUpdateStatus && (
                  <td>
                    {wo.status !== "COMPLETED" && (
                      <select value="" onChange={(e) => e.target.value && updateStatus(wo.id, e.target.value)}>
                        <option value="">Change status...</option>
                        {["ASSIGNED", "IN_PROGRESS", "COMPLETED"].filter((s) => s !== wo.status).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}>No work orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
