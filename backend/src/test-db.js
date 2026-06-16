require("dotenv").config();
const prisma = require("./prisma");

async function testConnection() {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("DB connection successful:", result);
  } catch (error) {
    console.error("DB connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
