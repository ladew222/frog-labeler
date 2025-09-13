-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AudioFile" (
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
    CONSTRAINT "AudioFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "hotkey" TEXT,
    CONSTRAINT "Label_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audioId" TEXT NOT NULL,
    "startS" REAL NOT NULL,
    "endS" REAL NOT NULL,
    "labelId" TEXT NOT NULL,
    "confidence" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Segment_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "AudioFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Segment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioFile_originalName_key" ON "AudioFile"("originalName");

-- CreateIndex
CREATE INDEX "AudioFile_projectId_idx" ON "AudioFile"("projectId");

-- CreateIndex
CREATE INDEX "AudioFile_recordedAt_idx" ON "AudioFile"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Label_projectId_name_key" ON "Label"("projectId", "name");

-- CreateIndex
CREATE INDEX "Segment_audioId_startS_idx" ON "Segment"("audioId", "startS");
