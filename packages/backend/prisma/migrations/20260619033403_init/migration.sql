-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '其他',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "WorldSetting_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlotCard_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Novel_userId_idx" ON "Novel"("userId");

-- CreateIndex
CREATE INDEX "Novel_userId_updatedAt_idx" ON "Novel"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Chapter_novelId_idx" ON "Chapter"("novelId");

-- CreateIndex
CREATE INDEX "Chapter_novelId_sequence_idx" ON "Chapter"("novelId", "sequence");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "WorldSetting_novelId_idx" ON "WorldSetting"("novelId");

-- CreateIndex
CREATE INDEX "PlotCard_novelId_idx" ON "PlotCard"("novelId");

-- CreateIndex
CREATE INDEX "PlotCard_novelId_actNumber_idx" ON "PlotCard"("novelId", "actNumber");

-- CreateIndex
CREATE INDEX "Foreshadowing_novelId_idx" ON "Foreshadowing"("novelId");
