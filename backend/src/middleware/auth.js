const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/**
 * Verifies the Bearer JWT and attaches { id, username, role, locationId } to req.user.
 * Every route below this middleware is guaranteed to have an authenticated user -
 * this is the "backend authorization is mandatory" requirement from the spec.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restricts a route to a set of roles. Usage: authorize("ADMIN", "OPERATIONS")
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Role '${req.user.role}' is not permitted to perform this action`,
      });
    }
    return next();
  };
}

/**
 * Live Verification "Change 4" hook: if a user has a locationId assigned,
 * they may only act on that location. Admins (locationId null) bypass this.
 * Pass a function that extracts the locationId being targeted from the request.
 */
function enforceLocationScope(getLocationId) {
  return (req, res, next) => {
    if (!req.user.locationId) return next(); // unscoped user (e.g. admin)
    const targetLocationId = getLocationId(req);
    if (targetLocationId && targetLocationId !== req.user.locationId) {
      return res.status(403).json({ error: "You are not permitted to act on this location" });
    }
    return next();
  };
}

module.exports = { authenticate, authorize, enforceLocationScope, JWT_SECRET };
