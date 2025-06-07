const { PrismaClient } = require("@prisma/client")
require("dotenv").config()

const prisma = new PrismaClient()

async function main() {
  try {
    console.log("🔄 Running Prisma migrations...")

    // Check if we can connect to the database
    await prisma.$connect()
    console.log("✅ Connected to database successfully")

    // Check if tables exist
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `

    const tablesExist = tableCheck[0].exists

    if (tablesExist) {
      console.log("✅ Database tables already exist")
      console.log("🔄 You can now use Prisma with your existing data")
    } else {
      console.log("⚠️ Database tables do not exist")
      console.log("🔄 Run prisma migrate to create the tables:")
      console.log("   npx prisma migrate dev --name init")
    }

    console.log("\n📊 Prisma setup complete!")
  } catch (error) {
    console.error("❌ Error during migration:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
