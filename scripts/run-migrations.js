const fs = require("fs")
const path = require("path")
const { neon } = require("@neondatabase/serverless")

// Load environment variables if needed
// require('dotenv').config();

async function runMigrations() {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL environment variable is not set")
      console.error("Please set the DATABASE_URL environment variable and try again")
      process.exit(1)
    }

    console.log("🔄 Connecting to database...")
    const sql = neon(process.env.DATABASE_URL)

    // Create migrations table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // Get list of executed migrations
    const executedMigrations = await sql`SELECT name FROM migrations`
    const executedMigrationNames = new Set(executedMigrations.map((m) => m.name))

    // Get all SQL files in the scripts directory
    const scriptsDir = __dirname
    const sqlFiles = fs
      .readdirSync(scriptsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort() // Sort to ensure order

    console.log(`📁 Found ${sqlFiles.length} SQL files`)

    let migrationsRun = 0

    // Execute each SQL file that hasn't been executed yet
    for (const sqlFile of sqlFiles) {
      if (executedMigrationNames.has(sqlFile)) {
        console.log(`⏭️  Skipping ${sqlFile} (already executed)`)
        continue
      }

      console.log(`🔄 Executing ${sqlFile}...`)

      const sqlFilePath = path.join(scriptsDir, sqlFile)
      const sqlContent = fs.readFileSync(sqlFilePath, "utf8")

      // Execute the SQL commands
      await sql.query(sqlContent)

      // Record the migration
      await sql`INSERT INTO migrations (name) VALUES (${sqlFile})`

      console.log(`✅ Executed ${sqlFile} successfully`)
      migrationsRun++
    }

    if (migrationsRun === 0) {
      console.log("✅ Database is already up to date. No migrations needed.")
    } else {
      console.log(`✅ Successfully ran ${migrationsRun} migrations`)
    }

    // Verify tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `

    console.log("\n📊 Available tables:")
    tables.forEach((table) => {
      console.log(`  - ${table.table_name}`)
    })

    console.log("\n🎉 Database setup complete!")
  } catch (error) {
    console.error("❌ Error running migrations:", error)
    process.exit(1)
  }
}

// Run the migrations
runMigrations()
