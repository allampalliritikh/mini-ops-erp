process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_SECRET = "test-secret";

module.exports = {
  testEnvironment: "node",
  testTimeout: 15000,
};
