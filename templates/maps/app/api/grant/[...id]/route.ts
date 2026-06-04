import { NextResponse } from "next/server";
import { queryGrantById } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// Grant ids contain slashes (e.g. "EU/AGRIP/agrip-multi-2021-im"), so this is a
// catch-all segment; rejoin it into the full id.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> },
) {
  const { id } = await params;
  // Next.js already percent-decodes route params; just rejoin the segments.
  const grantId = id.join("/");
  const row = await queryGrantById(grantId);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(row, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
