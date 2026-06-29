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

export const memoPostSchema = z.object({
  title: z.preprocess(trim, z.string().min(1).max(200)),
  content: z.preprocess(trim, z.string().min(1).max(8000)),
  pinned: z.boolean().optional().default(false),
  metadata: safeMetadataSchema,
});

export const memoPatchSchema = z
  .object({
    title: z.preprocess(trim, z.string().min(1).max(200)).optional(),
    content: z.preprocess(trim, z.string().min(1).max(8000)).optional(),
    pinned: z.boolean().optional(),
    metadata: safeMetadataSchema,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });

export const scheduledJobPostSchema = z
  .object({
    fireAt: z.string().datetime({ offset: true }).optional(),
    cron: z.string().min(9).max(128).optional(),
    timezone: z.string().min(1).max(64),
    prompt: z.preprocess(trim, z.string().min(1).max(500)),
    description: z.preprocess(trim, z.string().max(200)).optional(),
    runOnce: z.boolean().optional(),
  })
  .refine((v) => (v.fireAt && !v.cron) || (!v.fireAt && v.cron), {
    message: "Exactly one of fireAt or cron is required",
  });

export const scheduledJobPatchSchema = z
  .object({
    cron: z.string().min(9).max(128).optional(),
    timezone: z.string().min(1).max(64).optional(),
    prompt: z.preprocess(trim, z.string().min(1).max(500)).optional(),
    description: z.preprocess(trim, z.string().max(200)).optional().nullable(),
    runOnce: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
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

// --------------- Atlas ---------------

export const atlasElementCreateSchema = z.object({
  type: z.enum(["note", "photo"]),
  x: z.number().finite(),
  y: z.number().finite(),
  content: z.preprocess(trim, z.string().max(2000)).optional(),
  caption: z.preprocess(trim, z.string().max(200)).optional(),
  rotation: z.number().min(-15).max(15).optional(),
});

export const atlasElementPatchSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    rotation: z.number().min(-15).max(15).optional(),
    zIndex: z.number().int().min(0).max(10000).optional(),
    content: z.preprocess(trim, z.string().max(2000)).optional(),
    caption: z.preprocess(trim, z.string().max(200)).optional(),
    width: z.number().positive().max(800).optional(),
    height: z.number().positive().max(800).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });

export const atlasConnectionCreateSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  color: z.string().max(20).optional(),
});

// --------------- Home spatial board ---------------

export const homeBoardElementPatchSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    zIndex: z.number().int().min(0).max(10000).optional(),
    caption: z.preprocess(trim, z.string().max(200)).optional(),
    width: z.number().positive().min(120).max(640).optional(),
    height: z.number().positive().min(90).max(800).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });

export const homeBoardConnectionCreateSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  color: z.string().max(20).optional(),
});

export const atlasDragSchema = z.object({
  elementId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const studyStartSchema = z.object({
  plannedMinutes: z.number().int().min(1).max(180).optional(),
});

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
