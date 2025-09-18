/*
  Warnings:

  - Added the required column `createdById` to the `Segment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Segment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audioId" TEXT NOT NULL,
    "startS" REAL NOT NULL,
    "endS" REAL NOT NULL,
    "labelId" TEXT NOT NULL,
    "confidence" REAL,
    "notes" TEXT,
    "individuals" INTEGER,
    "callingRate" REAL,
    "quality" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Segment_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "AudioFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Segment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Segment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Segment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Segment" ("audioId", "callingRate", "confidence", "createdAt", "endS", "id", "individuals", "labelId", "notes", "quality", "startS") SELECT "audioId", "callingRate", "confidence", "createdAt", "endS", "id", "individuals", "labelId", "notes", "quality", "startS" FROM "Segment";
DROP TABLE "Segment";
ALTER TABLE "new_Segment" RENAME TO "Segment";
CREATE INDEX "Segment_audioId_startS_idx" ON "Segment"("audioId", "startS");
CREATE INDEX "Segment_labelId_idx" ON "Segment"("labelId");
CREATE INDEX "Segment_createdById_idx" ON "Segment"("createdById");
CREATE INDEX "Segment_updatedById_idx" ON "Segment"("updatedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
