// src/lib/dbWithMiddleware.ts
import { db } from "./db";
import { Prisma } from "@prisma/client";

const globalWithMW = globalThis as unknown as { _lmApplied?: boolean };

if (!globalWithMW._lmApplied) {
  globalWithMW._lmApplied = true;

  db.$use(async (params, next) => {
    const result = await next(params);

    // If a Segment changed, bump its parent AudioFile.lastModifiedAt
    if (
      params.model === "Segment" &&
      ["create", "update", "upsert", "delete", "updateMany", "deleteMany"].includes(params.action)
    ) {
      if (["create", "update", "upsert"].includes(params.action)) {
        const audioFileId =
          (params.args?.data?.audioId as string | undefined) ??
          ((result as any)?.audioId as string | undefined);

        if (audioFileId) {
          await db.audioFile.update({
            where: { id: audioFileId },
            data: { lastModifiedAt: new Date() },
          });
        }
      } else {
        const affected = await db.segment.findMany({
          where: params.args?.where ?? {},
          select: { audioId: true },
        });
        const ids = [...new Set(affected.map(a => a.audioId))];
        if (ids.length) {
          await db.audioFile.updateMany({
            where: { id: { in: ids } },
            data: { lastModifiedAt: new Date() },
          });
        }
      }
    }

    // If AudioFile itself changed, bump its own lastModifiedAt
    if (
      params.model === "AudioFile" &&
      ["create", "update", "upsert"].includes(params.action)
    ) {
      const id =
        (params.args?.where?.id as string | undefined) ??
        ((result as any)?.id as string | undefined);

      if (id) {
        await db.audioFile.update({
          where: { id },
          data: { lastModifiedAt: new Date() },
        });
      }
    }

    return result;
  });
}

export { db };
