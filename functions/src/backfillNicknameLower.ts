import { initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

initializeApp();

const db = getFirestore();
const PAGE_SIZE = 400;

interface BackfillSummary {
  scanned: number;
  matched: number;
  updated: number;
  dryRun: boolean;
}

function parseLimitArg(args: string[]): number | null {
  const limitIndex = args.indexOf("--limit");
  if (limitIndex < 0) {
    return null;
  }

  const raw = args[limitIndex + 1];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid --limit value. Use a positive number.");
  }

  return Math.floor(value);
}

async function backfillNicknameLower(): Promise<BackfillSummary> {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const updateLimit = parseLimitArg(args);

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const samples: string[] = [];

  while (true) {
    let pageQuery = db
      .collection("members")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (lastDoc) {
      pageQuery = pageQuery.startAfter(lastDoc);
    }

    const pageSnapshot = await pageQuery.get();
    if (pageSnapshot.empty) {
      break;
    }

    const batch = db.batch();

    for (const docSnap of pageSnapshot.docs) {
      scanned += 1;
      const data = docSnap.data() as Record<string, unknown>;
      const nicknameRaw = data.nickname;
      if (typeof nicknameRaw !== "string") {
        continue;
      }

      const nickname = nicknameRaw.trim();
      if (!nickname) {
        continue;
      }

      const desiredNicknameLower = nickname.toLowerCase();
      const currentNicknameLower = typeof data.nicknameLower === "string" ? data.nicknameLower : null;

      if (currentNicknameLower === desiredNicknameLower) {
        continue;
      }

      matched += 1;
      if (samples.length < 25) {
        samples.push(`${docSnap.id}: "${nickname}" -> "${desiredNicknameLower}"`);
      }

      if (!dryRun) {
        batch.update(docSnap.ref, {
          nicknameLower: desiredNicknameLower,
          updatedAt: Timestamp.now()
        });
        updated += 1;
      }

      if (updateLimit !== null && matched >= updateLimit) {
        break;
      }
    }

    if (!dryRun && updated > 0) {
      await batch.commit();
    }

    if (updateLimit !== null && matched >= updateLimit) {
      break;
    }

    lastDoc = pageSnapshot.docs[pageSnapshot.docs.length - 1] ?? null;
  }

  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Scanned members: ${scanned}`);
  console.log(`Members needing nicknameLower update: ${matched}`);
  console.log(`Members updated: ${dryRun ? 0 : updated}`);
  if (updateLimit !== null) {
    console.log(`Limit used: ${updateLimit}`);
  }

  if (samples.length > 0) {
    console.log("Sample changes:");
    for (const sample of samples) {
      console.log(`- ${sample}`);
    }
  }

  if (dryRun) {
    console.log("\nNo writes were made. Re-run with --apply to perform updates.");
  }

  return {
    scanned,
    matched,
    updated: dryRun ? 0 : updated,
    dryRun
  };
}

void backfillNicknameLower().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Nickname lower-case backfill failed: ${message}`);
  process.exitCode = 1;
});
