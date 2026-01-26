import * as z from 'zod/v3';
import type { JsonValue } from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

export const mfaMethodSchema = z.enum(['email', 'authenticator', 'security_key'])
export type MfaMethod = z.infer<typeof mfaMethodSchema>

const webAuthnBaseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.string(), jsonValueSchema).optional(),
})

export const webAuthnRegistrationCredentialSchema = webAuthnBaseSchema.extend({
  response: z.object({
    attestationObject: z.string().min(1),
    clientDataJSON: z.string().min(1),
  }),
})

export type WebAuthnRegistrationCredential = z.infer<
  typeof webAuthnRegistrationCredentialSchema
>

export const webAuthnAuthenticationCredentialSchema = webAuthnBaseSchema.extend({
  response: z.object({
    authenticatorData: z.string().min(1),
    clientDataJSON: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().nullable().optional(),
  }),
})

export type WebAuthnAuthenticationCredential = z.infer<
  typeof webAuthnAuthenticationCredentialSchema
>

export const webAuthnCredentialSchema = z.union([
  webAuthnAuthenticationCredentialSchema,
  webAuthnRegistrationCredentialSchema,
])

export const mfaSetupRequestSchema = z.object({
  method: mfaMethodSchema,
})
export type MfaSetupRequest = z.infer<typeof mfaSetupRequestSchema>

export const mfaMethodChangeSchema = z.object({
  newMethod: mfaMethodSchema,
  verificationCode: z.string().min(1).optional(),
})
export type MfaMethodChangeRequest = z.infer<typeof mfaMethodChangeSchema>

export const mfaVerifyRequestSchema = z.object({
  code: z.string().min(1).optional(),
  backupCode: z.string().min(1).optional(),
})
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>

export const mfaVerifyLoginSchema = z.object({
  code: z.string().min(1),
  useBackupCode: z.boolean().optional(),
})
export type MfaVerifyLoginRequest = z.infer<typeof mfaVerifyLoginSchema>

export const mfaVerificationSchema = z.object({
  code: z.string().min(1).optional(),
  method: mfaMethodSchema,
  credential: webAuthnCredentialSchema.optional(),
})
export type MfaVerificationRequest = z.infer<typeof mfaVerificationSchema>

export const webAuthnVerifyAuthSchema = z.object({
  credential: webAuthnAuthenticationCredentialSchema,
})
export type WebAuthnVerifyAuthRequest = z.infer<typeof webAuthnVerifyAuthSchema>

export const webAuthnRegistrationSchema = z.object({
  credential: webAuthnRegistrationCredentialSchema,
  method: z.literal('security_key'),
})
export type WebAuthnRegistrationRequest = z.infer<typeof webAuthnRegistrationSchema>

export interface MfaStatusResponse {
  mfaEnabled: boolean
  mfaMethod: MfaMethod | null
  hasBackupCodes: boolean
  backupCodesCount: number
}

export interface MfaAvailabilityResponse {
  success: boolean
  availability: {
    email: boolean
    authenticator: boolean
    security_key: boolean
  }
}

export interface MfaSetupResponse {
  success: boolean
  message?: string
  qrCode?: string
  secret?: string
  manualEntryKey?: string
  requiresWebAuthn?: boolean
}

export interface MfaBackupCodesResponse {
  backupCodes: string[]
}
