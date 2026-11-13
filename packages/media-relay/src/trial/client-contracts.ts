import { z } from "zod";
import { PublicContextSchema, StreamIdSchema, PlaybackModeSchema } from "../contracts";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const NativeTrialRoutingSchema = z.strictObject({ trialId: id, context: PublicContextSchema,
  streamId: StreamIdSchema, expiresAt: z.number().finite().nonnegative(), href: z.string().startsWith("/") });
export type NativeTrialRouting = z.infer<typeof NativeTrialRoutingSchema>;
export const NativeTrialOpenSchema = z.strictObject({ trialId: id, context: PublicContextSchema,
  streamId: StreamIdSchema, preferredMode: PlaybackModeSchema });
