import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Inventory from "./pages/Inventory.jsx";
import WorkOrders from "./pages/WorkOrders.jsx";
import Transfers from "./pages/Transfers.jsx";
import Orders from "./pages/Orders.jsx";

function Protected({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <div className="app-shell">
      {isAuthenticated && (
        <header className="topbar">
          <nav>
            <NavLink to="/inventory">Inventory</NavLink>
            <NavLink to="/work-orders">Work Orders</NavLink>
            <NavLink to="/transfers">Internal Transfers</NavLink>
            <NavLink to="/orders">Customer Orders</NavLink>
          </nav>
          <div>
            <span style={{ marginRight: 12, fontSize: 13 }}>
              {user?.username} · {user?.role}
            </span>
            <button className="secondary" onClick={logout}>Logout</button>
          </div>
        </header>
      )}

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
        <Route path="/work-orders" element={<Protected><WorkOrders /></Protected>} />
        <Route path="/transfers" element={<Protected><Transfers /></Protected>} />
        <Route path="/orders" element={<Protected><Orders /></Protected>} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/inventory" : "/login"} replace />} />
      </Routes>
    </div>
  );
}
