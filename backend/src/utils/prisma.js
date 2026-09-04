const { PrismaClient } = require("@prisma/client");

// Single shared instance across the app (and across test files).
const prisma = new PrismaClient();

module.exports = prisma;
