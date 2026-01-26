import * as z from 'zod/v3';

export const dailyBriefingSchema = z.object({
  dismissTime: z.string().optional(),
  emailEnabled: z.boolean().optional(),
  emailTime: z.string().optional(),
})

export const backgroundConfigSchema = z.object({
  type: z.string().optional(),
  enabled: z.boolean().optional(),
})

export const userPreferencesSchema = z.object({
  followUpSuggestions: z.boolean().optional(),
  auroraBackground: z.boolean().optional(),
  backgroundConfig: backgroundConfigSchema.optional(),
  dailyBriefing: dailyBriefingSchema.optional(),
})

export type UserPreferences = z.infer<typeof userPreferencesSchema>

export const preferencesPatchSchema = z.object({
  preferences: userPreferencesSchema.optional(),
  backgroundConfig: backgroundConfigSchema.optional(),
  followUpSuggestions: z.boolean().optional(),
  dailyBriefing: dailyBriefingSchema.optional(),
})

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>

export interface UserPreferencesResponse {
  preferences: UserPreferences
}
