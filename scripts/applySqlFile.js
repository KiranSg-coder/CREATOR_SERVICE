/**
 * Apply SQL migration batches split on GO lines.
 * Usage: node scripts/applySqlFile.js path/to/file.sql
 */
const fs = require("fs");
const path = require("path");
const sequelize = require("../src/config/database");

async function main() {
  const rel = process.argv[2];
  if (!rel) {
    console.error("Usage: node scripts/applySqlFile.js <sql-file>");
    process.exit(1);
  }
  const filePath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  const raw = fs.readFileSync(filePath, "utf8");
  const batches = raw
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .filter((b) => !/^USE\s+/i.test(b));

  console.log(`Applying ${batches.length} batch(es) from ${filePath}`);
  await sequelize.authenticate();
  for (let i = 0; i < batches.length; i++) {
    const sql = batches[i];
    try {
      await sequelize.query(sql);
      console.log(`  OK batch ${i + 1}/${batches.length}`);
    } catch (err) {
      console.error(`  FAIL batch ${i + 1}/${batches.length}:`, err.message);
      console.error(sql.slice(0, 200));
      process.exit(1);
    }
  }
  console.log("Done.");
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
