/** Staging fails closed. These lists contain approved synthetic recipients only. */
export function assertRecipient(channel: 'email' | 'sms', recipient: string) {
  if (process.env.ALLOW_REAL_PATIENTS === 'true') return;
  const normalize = (value: string) => channel === 'email' ? value.trim().toLowerCase() : value.replace(/[^\d+]/g, '');
  const list = (process.env[channel === 'email' ? 'STAGING_EMAIL_ALLOWLIST' : 'STAGING_PHONE_ALLOWLIST'] ?? '').split(',').map(normalize).filter(Boolean);
  if (!list.includes(normalize(recipient))) throw new Error('Recipient is not approved for staging.');
}
export function failureCategory(error: string) {
  if (/reconcil|mismatch|settling|allocation|agreement|deposit balance/i.test(error)) return 'reconciliation';
  if (/not matched|contact match|match the|contact ID/i.test(error)) return 'contact_match';
  if (/not configured|configuration|staging|missing|configure/i.test(error)) return 'configuration';
  if (/429|rate limit/i.test(error)) return 'rate_limit';
  if (/401|403|authorization/i.test(error)) return 'authorization';
  return 'provider';
}
