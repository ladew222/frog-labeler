-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AudioFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "durationS" REAL,
    "sampleRate" INTEGER,
    "recordedAt" DATETIME,
    "site" TEXT,
    "unitId" TEXT,
    "extension" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudioFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AudioFile" ("createdAt", "durationS", "extension", "id", "originalName", "projectId", "recordedAt", "sampleRate", "site", "unitId", "uri") SELECT "createdAt", "durationS", "extension", "id", "originalName", "projectId", "recordedAt", "sampleRate", "site", "unitId", "uri" FROM "AudioFile";
DROP TABLE "AudioFile";
ALTER TABLE "new_AudioFile" RENAME TO "AudioFile";
CREATE UNIQUE INDEX "AudioFile_originalName_key" ON "AudioFile"("originalName");
CREATE INDEX "AudioFile_projectId_idx" ON "AudioFile"("projectId");
CREATE INDEX "AudioFile_recordedAt_idx" ON "AudioFile"("recordedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
