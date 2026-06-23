/** Extrae la ruta del objeto dentro de un bucket de Supabase Storage desde su URL pública.
 *  Ej.: https://x.supabase.co/storage/v1/object/public/wm-public/brand/abc.png
 *       -> "brand/abc.png" (bucket "wm-public"). Devuelve null si la URL no corresponde. */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}
