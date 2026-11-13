-- 从原项目五次迁移生成的临时 SQLite 读取，非另建简化表。
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Character" (
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
    "sequence" INTEGER NOT NULL DEFAULT 0, "avatar" TEXT, "relationships" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Foreshadowing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "plantedChapterId" TEXT,
    "resolvedChapterId" TEXT,
    "plantedPlotCardId" TEXT,
    "resolvedPlotCardId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Foreshadowing_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cover" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "genre" TEXT,
    "summary" TEXT,
    "agentPrompt" TEXT,
    "lastOpenedChapterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Novel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PlotCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "actNumber" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "chapterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "type" TEXT NOT NULL DEFAULT 'chapter', "volumeId" TEXT, "statusMode" TEXT NOT NULL DEFAULT 'auto',
    CONSTRAINT "PlotCard_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WorldSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '其他',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "WorldSetting_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Chapter_novelId_idx" ON "Chapter"("novelId");

CREATE INDEX "Chapter_novelId_sequence_idx" ON "Chapter"("novelId", "sequence");

CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

CREATE INDEX "Character_novelId_role_idx" ON "Character"("novelId", "role");

CREATE INDEX "Character_novelId_sequence_idx" ON "Character"("novelId", "sequence");

CREATE INDEX "Foreshadowing_novelId_idx" ON "Foreshadowing"("novelId");

CREATE INDEX "Novel_userId_idx" ON "Novel"("userId");

CREATE INDEX "Novel_userId_updatedAt_idx" ON "Novel"("userId", "updatedAt");

CREATE INDEX "PlotCard_novelId_actNumber_idx" ON "PlotCard"("novelId", "actNumber");

CREATE INDEX "PlotCard_novelId_idx" ON "PlotCard"("novelId");

CREATE INDEX "PlotCard_novelId_type_idx" ON "PlotCard"("novelId", "type");

CREATE INDEX "PlotCard_novelId_volumeId_idx" ON "PlotCard"("novelId", "volumeId");

CREATE INDEX "User_email_idx" ON "User"("email");

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE INDEX "WorldSetting_novelId_idx" ON "WorldSetting"("novelId");
