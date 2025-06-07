const fs = require("fs")
const path = require("path")
const { neon } = require("@neondatabase/serverless")

require('dotenv').config();

async function initializeDatabase() {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL environment variable is not set")
      console.error("Please set the DATABASE_URL environment variable and try again")
      process.exit(1)
    }

    console.log("🔄 Connecting to database...")
    const sql = neon(process.env.DATABASE_URL)

    // Read the SQL file
    const sqlFilePath = path.join(__dirname, "001-init-schema.sql")
    const sqlContent = fs.readFileSync(sqlFilePath, "utf8")

    console.log("📄 SQL file loaded successfully")
    console.log("🔄 Executing SQL commands...")

    // Execute the SQL commands
    await sql.query(sqlContent)

    console.log("✅ Database schema initialized successfully!")

    // Verify tables were created
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `

    console.log("\n📊 Created tables:")
    tables.forEach((table) => {
      console.log(`  - ${table.table_name}`)
    })

    console.log("\n🎉 Database setup complete!")
  } catch (error) {
    console.error("❌ Error initializing database:", error)
    process.exit(1)
  }
}

// Run the initialization
initializeDatabase()
