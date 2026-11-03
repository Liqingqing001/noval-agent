ALTER TABLE "Character" ADD COLUMN "avatar" TEXT;
ALTER TABLE "Character" ADD COLUMN "relationships" TEXT NOT NULL DEFAULT '[]';
