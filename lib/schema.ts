import { z } from "zod";

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("bulleted_list"),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("numbered_list"),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("checklist"),
    items: z.array(z.string().min(1)).min(1),
  }),
]);

export const docPlanSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  sections: z.array(
    z.object({
      heading: z.string(),
      blocks: z.array(blockSchema).min(1),
    })
  ).min(1),
  /** Short DALL·E prompts tied to section indices (0-based), max 3 in generator */
  illustrations: z.array(
    z.object({
      afterSectionIndex: z.number().int().min(0),
      prompt: z.string(),
    })
  ),
});

export type DocPlan = z.infer<typeof docPlanSchema>;
