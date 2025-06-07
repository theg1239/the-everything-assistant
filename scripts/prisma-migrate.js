const { execSync } = require("child_process")
require("dotenv").config()

async function main() {
  try {
    console.log("🔄 Running Prisma migrations...")

    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL environment variable is not set")
      process.exit(1)
    }

    // Generate Prisma client
    console.log("🔄 Generating Prisma client...")
    execSync("npx prisma generate", { stdio: "inherit" })

    // Run migrations
    console.log("🔄 Running database migrations...")
    execSync("npx prisma migrate dev --name init", { stdio: "inherit" })

    console.log("✅ Prisma migrations completed successfully")
  } catch (error) {
    console.error("❌ Error during Prisma migration:", error)
    process.exit(1)
  }
}

main()
