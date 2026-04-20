import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  AlignmentType,
  TextRun,
} from "docx";
import mammoth from "mammoth";
import { docPlanSchema, type DocPlan } from "./schema";

const MAX_IMAGES = 3;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const IMAGE_TIMEOUT_MS = 20_000;

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "document"
  );
}

/** Groq may rarely wrap JSON in fences; strip if present. */
function extractJsonObject(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (m) return m[1].trim();
  return t;
}

async function planDocument(topic: string): Promise<DocPlan> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert document formatter and writer.

Given a user prompt, choose a structure that best matches the request. Do NOT force the same layout every time.

If the user asks for a specific format (for example: proposal, letter, email, SOP, checklist, numbered steps, FAQ, blog style, executive summary, meeting notes), strictly follow that format and tone.

Output a JSON object with this exact shape:
{
  "title": string,
  "subtitle": string (optional),
  "sections": [{
    "heading": string,
    "blocks": [
      { "type": "paragraph", "text": string }
      OR { "type": "bulleted_list", "items": string[] }
      OR { "type": "numbered_list", "items": string[] }
      OR { "type": "checklist", "items": string[] }
    ]
  }],
  "illustrations": [{ "afterSectionIndex": number, "prompt": string }]
}

Rules:
- Use as many sections/blocks as appropriate for the specific user request (no fixed section count).
- Keep text plain (no markdown symbols).
- For concise prompts, keep output concise. For detailed prompts, provide deeper structure.
- "afterSectionIndex" is 0-based and within section range.
- Include 0 to ${MAX_IMAGES} illustrations only when visuals help the requested document.
- If user asks for a no-image or text-only output, return an empty illustrations array.
- JSON only, no markdown fences.`,
        },
        { role: "user", content: topic },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No plan returned from the model.");
  const parsed = JSON.parse(extractJsonObject(raw));
  return docPlanSchema.parse(parsed);
}

/** Pollinations serves PNG/JPEG from a prompt URL; no API key required. */
async function fetchIllustrationPng(prompt: string): Promise<Buffer> {
  const full = `${prompt}. Professional, clean, no overlaid text, suitable for a report.`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=1024&height=1024&nologo=true`;
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!imgRes.ok) {
    throw new Error(`Image fetch failed: ${imgRes.status}`);
  }
  const ab = await imgRes.arrayBuffer();
  return Buffer.from(ab);
}

export async function buildWordAndPreview(topic: string): Promise<{
  buffer: Buffer;
  html: string;
  filename: string;
}> {
  const plan = await planDocument(topic);

  const illustrations = plan.illustrations.slice(0, MAX_IMAGES);
  const imageBuffers = (
    await Promise.all(
      illustrations.map(async (ill) => {
        try {
          const buf = await fetchIllustrationPng(ill.prompt);
          return { afterIndex: ill.afterSectionIndex, buf };
        } catch {
          // Skip failed images; document still ships
          return null;
        }
      })
    )
  ).filter((v): v is { afterIndex: number; buf: Buffer } => v !== null);

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: plan.title,
      heading: HeadingLevel.TITLE,
    })
  );
  if (plan.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: plan.subtitle, italics: true, size: 24 }),
        ],
      })
    );
  }

  const usedImageKeys = new Set<number>();

  plan.sections.forEach((sec, index) => {
    children.push(
      new Paragraph({
        text: sec.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240 },
      })
    );
    for (const block of sec.blocks) {
      if (block.type === "paragraph") {
        children.push(
          new Paragraph({
            children: [new TextRun(block.text)],
            spacing: { after: 120 },
          })
        );
        continue;
      }

      if (block.type === "bulleted_list") {
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              spacing: { after: 70 },
            })
          );
        }
        children.push(new Paragraph({ text: "", spacing: { after: 50 } }));
        continue;
      }

      if (block.type === "numbered_list") {
        block.items.forEach((item, itemIdx) => {
          children.push(
            new Paragraph({
              children: [new TextRun(`${itemIdx + 1}. ${item}`)],
              spacing: { after: 70 },
            })
          );
        });
        children.push(new Paragraph({ text: "", spacing: { after: 50 } }));
        continue;
      }

      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: [new TextRun(`\u2610 ${item}`)],
            spacing: { after: 70 },
          })
        );
      }
      children.push(new Paragraph({ text: "", spacing: { after: 50 } }));
    }

    imageBuffers.forEach((item, imgIdx) => {
      if (item.afterIndex !== index) return;
      usedImageKeys.add(imgIdx);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: item.buf,
              transformation: { width: 520, height: 520 },
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    });
  });

  imageBuffers.forEach((item, imgIdx) => {
    if (usedImageKeys.has(imgIdx)) return;
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: item.buf,
            transformation: { width: 520, height: 520 },
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  });

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = Buffer.from(await Packer.toBuffer(doc));
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const filename = `${slugify(plan.title)}.docx`;

  return { buffer, html, filename };
}
