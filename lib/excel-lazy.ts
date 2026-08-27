/**
 * Carga `lib/excel` (y con ella ExcelJS + JSZip) sólo cuando el usuario realmente
 * exporta o importa un `.xlsx`.
 *
 * Importarlo de forma estática metía un chunk de 913 KB sin comprimir en el bundle
 * de /inventario y otro igual en /productos, que se descargaba y parseaba en cada
 * visita aunque nadie tocara la carga masiva.
 */
export function loadExcel() {
  return import("@/lib/excel");
}
