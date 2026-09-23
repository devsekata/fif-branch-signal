export const T = {
  sig: '#C8322B', warn: '#D8801F', hold: '#B08F2A', calm: '#8FA5A3', grow: '#1F8C84',
  deep: '#135955', mist: '#BEE9E6', brand: '#53DBD5', ink: '#0B2320', ink3: '#7C9491', rule: '#DCE6E5',
} as const;
export const STAR = ['#C8322B', '#D8801F', '#B08F2A', '#8CCFC9', '#17857C'];
export const IG = '#7A3A66';
export const PRI: Record<string, string> = { critical: T.sig, high: T.warn, medium: T.hold, low: T.calm };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const riskColor = (risk: number) => (risk >= 45 ? T.sig : risk >= 25 ? T.warn : T.grow);
export const sevColor = (sev: number) => (sev === 4 ? T.sig : sev === 3 ? T.warn : T.calm);

/** Single-line excerpt with an ellipsis when cut. */
export const clip = (text: string, n: number) => text.replace(/\n+/g, ' ').slice(0, n) + (text.length > n ? '…' : '');
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const pct = (part: number, whole: number) => Math.round((100 * part) / Math.max(1, whole));

/** ISO timestamp as "YYYY-MM-DD HH:mm WIB". */
export const wib = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso)) + ' WIB';

/** `YYYY-MM-DD` that many days before `anchor` (or today). */
export function daysBefore(anchor: string | undefined, days: number) {
  const d = anchor ? new Date(`${anchor}T00:00:00Z`) : new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
