-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "appearance" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "firstAppearanceChapterId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'supporting',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("aliases", "appearance", "background", "description", "firstAppearanceChapterId", "id", "name", "novelId", "personality") SELECT "aliases", "appearance", "background", "description", "firstAppearanceChapterId", "id", "name", "novelId", "personality" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");
CREATE INDEX "Character_novelId_role_idx" ON "Character"("novelId", "role");
CREATE INDEX "Character_novelId_sequence_idx" ON "Character"("novelId", "sequence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
