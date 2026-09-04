const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const inventoryRoutes = require("./routes/inventory");
const workOrderRoutes = require("./routes/workorders");
const transferRoutes = require("./routes/transfers");
const orderRoutes = require("./routes/orders");
const metaRoutes = require("./routes/meta");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/work-orders", workOrderRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api", metaRoutes);

// Centralized error handler as a safety net for anything routes didn't catch.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
