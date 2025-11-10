-- AlterTable
ALTER TABLE "public"."AudioFile" ADD COLUMN     "lastScannedAt" TIMESTAMP(3),
ADD COLUMN     "likelySound" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "AudioFile_likelySound_idx" ON "public"."AudioFile"("likelySound");
