/**
 * Text for matching typed input: lowercase, without accents, and with
 * Turkish dotless ı as i, so "cafe" finds "Café" and "isik" finds "Işık".
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
}
