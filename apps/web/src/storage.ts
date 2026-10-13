/**
 * Browser storage that never throws. Storage can be blocked (strict privacy settings, some private
 * modes, embedded frames); Fudo then works normally and only forgets choices between visits.
 */
export function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* blocked: nothing to remember */ }
}
