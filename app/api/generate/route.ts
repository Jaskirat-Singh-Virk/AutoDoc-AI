import { buildWordAndPreview } from "@/lib/generateDoc";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  topic: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { topic } = bodySchema.parse(json);
    const { buffer, html, filename } = await buildWordAndPreview(topic);
    const documentBase64 = buffer.toString("base64");
    return NextResponse.json({ ok: true as const, html, filename, documentBase64 });
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "Invalid request body."
        : e instanceof Error
          ? e.message
          : "Unknown error";
    const status = e instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ ok: false as const, error: message }, { status });
  }
}
