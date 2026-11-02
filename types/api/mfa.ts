import * as z from 'zod'
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

/* Response schemas for `app/api/user/mfa/**` and `app/api/auth/mfa-verify`. */

/** `GET /api/user/mfa` (`mfaMethod` is a free-form DB column; unknown values read as null). */
export const mfaStatusResponseSchema = z.object({
  mfaEnabled: z.boolean(),
  mfaMethod: mfaMethodSchema.nullable().catch(null),
  hasBackupCodes: z.boolean(),
  backupCodesCount: z.number(),
})
export type MfaStatusResponse = z.infer<typeof mfaStatusResponseSchema>

/** `GET /api/user/mfa/availability` */
export const mfaAvailabilityResponseSchema = z.object({
  success: z.boolean(),
  availability: z.object({
    email: z.boolean(),
    authenticator: z.boolean(),
    security_key: z.boolean(),
  }),
})
export type MfaAvailabilityResponse = z.infer<typeof mfaAvailabilityResponseSchema>

/** `POST /api/user/mfa/setup` (fields depend on the method being set up). */
export const mfaSetupResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  qrCode: z.string().optional(),
  secret: z.string().optional(),
  manualEntryKey: z.string().optional(),
  requiresWebAuthn: z.boolean().optional(),
})
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>

/**
 * `POST /api/user/mfa/verify`, `POST /api/user/mfa/webauthn/verify`,
 * `POST /api/user/mfa/backup-codes` (all return fresh backup codes on success).
 */
export const mfaBackupCodesResponseSchema = z.object({
  backupCodes: z.array(z.string()),
})
export type MfaBackupCodesResponse = z.infer<typeof mfaBackupCodesResponseSchema>

/** `PATCH /api/user/mfa/method` */
export const mfaMethodChangeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  requiresRegistration: z.boolean().optional(),
  qrCode: z.string().optional(),
  secret: z.string().optional(),
  manualEntryKey: z.string().optional(),
})
export type MfaMethodChangeResponse = z.infer<typeof mfaMethodChangeResponseSchema>

/**
 * `POST /api/user/mfa/webauthn/register`: `PublicKeyCredentialCreationOptionsJSON` from
 * `@simplewebauthn/server` (only the fields the client uses are checked).
 */
export const webAuthnCreationOptionsSchema = z.object({
  rp: z.object({ id: z.string().optional(), name: z.string() }),
  user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
  challenge: z.string(),
  pubKeyCredParams: z.array(z.object({ type: z.literal('public-key'), alg: z.number() })),
  timeout: z.number().optional(),
})

/**
 * `POST /api/user/mfa/webauthn/authenticate` (no credential in the body):
 * `PublicKeyCredentialRequestOptionsJSON` from `@simplewebauthn/server`.
 */
export const webAuthnRequestOptionsSchema = z.object({
  challenge: z.string(),
  timeout: z.number().optional(),
  rpId: z.string().optional(),
  allowCredentials: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('public-key'),
        transports: z.array(z.string()).optional(),
      })
    )
    .optional(),
  userVerification: z.enum(['required', 'preferred', 'discouraged']).optional(),
})
