-- Earlier installations added these fields through db push. Keep fresh installs compatible too.
ALTER TABLE "PlotCard" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'chapter';
ALTER TABLE "PlotCard" ADD COLUMN "volumeId" TEXT;
CREATE INDEX "PlotCard_novelId_type_idx" ON "PlotCard"("novelId", "type");
CREATE INDEX "PlotCard_novelId_volumeId_idx" ON "PlotCard"("novelId", "volumeId");
UPDATE "PlotCard" SET "status" = 'pending' WHERE "status" IN ('planned', 'writing');
