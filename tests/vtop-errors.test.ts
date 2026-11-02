import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyVtopFailure,
  rejectedStoredCredentials,
  requiresVtopCredentials,
} from '../lib/vtop-errors'

test('classifyVtopFailure reads errorKind / requiresCredentials, never the error text', () => {
  assert.equal(
    classifyVtopFailure({
      success: false,
      errorKind: 'invalid_credentials',
      requiresCredentials: true,
    }),
    'auth_rejected'
  )
  assert.equal(
    classifyVtopFailure({ success: false, errorKind: 'account_locked' }),
    'auth_rejected'
  )
  assert.equal(
    classifyVtopFailure({
      success: false,
      error: 'VTOP credentials required',
      requiresCredentials: true,
    }),
    'needs_credentials'
  )
  // A 500 / text that mentions credentials is just a failure (the old text match hid these).
  assert.equal(classifyVtopFailure({ success: false, error: 'VTOP request failed: 500' }), 'other')
  assert.equal(
    classifyVtopFailure({ success: false, error: 'Invalid LoginId/Password', errorKind: 'busy' }),
    'other'
  )
  assert.equal(classifyVtopFailure({ success: true, status: 'needs_selection' }), 'none')
  assert.equal(classifyVtopFailure(null), 'none')
})

test('rejectedStoredCredentials / requiresVtopCredentials use structured fields', () => {
  assert.equal(rejectedStoredCredentials({ errorKind: 'login_failed' }), true)
  assert.equal(rejectedStoredCredentials({ error: 'Login failed' }), false)
  assert.equal(requiresVtopCredentials({ requiresCredentials: true }), true)
  assert.equal(requiresVtopCredentials({ errorKind: 'missing_credentials' }), true)
  assert.equal(requiresVtopCredentials({ error: 'credentials' }), false)
})
