import { z } from "zod";

const trim = (s: unknown) => (typeof s === "string" ? s.trim() : s);

export const registerSchema = z.object({
  email: z.preprocess(trim, z.string().email().max(254).transform((s) => s.toLowerCase())),
  password: z.string().min(6).max(256),
  displayName: z.preprocess(trim, z.string().min(1).max(40)),
  inviteCode: z.string().min(1).max(128),
  city: z.preprocess(trim, z.string().min(1).max(80)).optional(),
  country: z.preprocess(trim, z.string().min(1).max(80)).optional(),
  timezone: z.preprocess(trim, z.string().min(1).max(64)).optional(),
});

export const loginSchema = z.object({
  email: z.preprocess(trim, z.string().email().max(254).transform((s) => s.toLowerCase())),
  password: z.string().min(1).max(256),
});

export const profileUpdateSchema = z
  .object({
    displayName: z.preprocess(trim, z.string().min(1).max(40)).optional(),
    profileNote: z.preprocess(trim, z.string().max(2000)).optional(),
    city: z.preprocess(trim, z.string().min(1).max(80)).optional(),
    country: z.preprocess(trim, z.string().min(1).max(80)).optional(),
    timezone: z.preprocess(trim, z.string().min(1).max(64)).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });

export const messagePostSchema = z.object({
  content: z.preprocess(trim, z.string().min(1).max(4000)),
  forceAgent: z.boolean().optional().default(false),
});

const noteColorSchema = z.enum(["warm", "sage", "skysoft", "rose", "cream"]).default("warm");
const safeMetadataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .refine(
    (v) => {
      if (!v) return true;
      try {
        return JSON.stringify(v).length <= 4_000;
      } catch {
        return false;
      }
    },
    { message: "metadata too large or unserializable" }
  );

export const notePostSchema = z.object({
  content: z.preprocess(trim, z.string().min(1).max(2000)),
  color: noteColorSchema,
  metadata: safeMetadataSchema,
});

export const memoPostSchema = z.object({
  title: z.preprocess(trim, z.string().min(1).max(200)),
  content: z.preprocess(trim, z.string().min(1).max(8000)),
  pinned: z.boolean().optional().default(false),
  metadata: safeMetadataSchema,
});

export const reminderPostSchema = z.object({
  title: z.preprocess(trim, z.string().min(1).max(200)),
  body: z.preprocess(trim, z.string().max(4000)).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().max(64).optional(),
  contactWindowStart: z.string().max(32).optional(),
  contactWindowEnd: z.string().max(32).optional(),
  notifyChannel: z.string().max(32).optional(),
  metadata: safeMetadataSchema,
});

export const roomCreateSchema = z.object({
  name: z.preprocess(trim, z.string().min(1).max(80)).optional(),
});

export const agentDispatchSchema = z
  .object({
    roomId: z.string().min(1).max(64),
    content: z.preprocess(trim, z.string().min(1).max(4000)).optional(),
    sourceMessageId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.content || v.sourceMessageId, {
    message: "Either content or sourceMessageId is required",
  });

export class ValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;
  constructor(issues: z.ZodIssue[]) {
    super("Validation failed");
    this.name = "ValidationError";
    this.issues = issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  }
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

export async function readJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const body = await request.json().catch(() => ({}));
  return parseBody(schema, body);
}
