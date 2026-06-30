import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

async function indexExists(indexName) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA index_list("PlotCard")`);
  return rows.some((row) => row.name === indexName);
}

async function addColumnIfMissing(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`✓ ${table}.${column} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  console.log(`+ added ${table}.${column}`);
}

async function createIndexIfMissing(indexName, sql) {
  if (await indexExists(indexName)) {
    console.log(`✓ index ${indexName} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(sql);
  console.log(`+ created index ${indexName}`);
}

async function main() {
  await addColumnIfMissing('Character', 'role', `TEXT NOT NULL DEFAULT 'supporting'`);
  await addColumnIfMissing('Character', 'sequence', `INTEGER NOT NULL DEFAULT 0`);

  await addColumnIfMissing('PlotCard', 'type', `TEXT NOT NULL DEFAULT 'chapter'`);
  await addColumnIfMissing('PlotCard', 'volumeId', `TEXT`);

  // 兼容旧状态：planned/writing 统一为 pending，completed 保留
  await prisma.$executeRawUnsafe(`UPDATE "PlotCard" SET "status" = 'pending' WHERE "status" IN ('planned', 'writing')`);

  await createIndexIfMissing('Character_novelId_role_idx', `CREATE INDEX "Character_novelId_role_idx" ON "Character"("novelId", "role")`);
  await createIndexIfMissing('Character_novelId_sequence_idx', `CREATE INDEX "Character_novelId_sequence_idx" ON "Character"("novelId", "sequence")`);
  await createIndexIfMissing('PlotCard_novelId_type_idx', `CREATE INDEX "PlotCard_novelId_type_idx" ON "PlotCard"("novelId", "type")`);
  await createIndexIfMissing('PlotCard_novelId_volumeId_idx', `CREATE INDEX "PlotCard_novelId_volumeId_idx" ON "PlotCard"("novelId", "volumeId")`);

  console.log('database patched successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
