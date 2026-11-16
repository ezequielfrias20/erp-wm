# Catálogo 3b — maestros y vista: plan de implementación

> Ejecución: inline (yo) + Codex (codex-rescue) por tareas con archivos disjuntos; revisión final
> de toda la rama con un revisor nuevo.

**Goal:** Configuración → Catálogo con los 5 maestros editables sin romper datos en uso, texto legado
sincronizado, vista `wm.v_catalog` y pantalla de lectura `/productos/catalogo`.

**Spec:** `docs/superpowers/specs/2026-11-16-catalogo-3b-maestros-y-vista-design.md`

## Global Constraints

- Textos de usuario y comentarios en español. Tests sólo en `lib/**/*.test.ts` (vitest).
- `.env.local` apunta a **producción**: ninguna escritura salvo la migración, con confirmación.
- Interfaz fija: `lib/catalog/admin-types.ts` (tipos) y las firmas de
  `app/(app)/configuracion/catalog-actions.ts` y `lib/queries/catalog-admin.ts` (ya en la rama).
- Permiso de escritura de maestros: `canEdit(session.permissions, "Inventario")`.
- Tras escribir: `invalidateCatalogMasters()`, `invalidateCatalogRefs()`,
  `revalidatePath("/configuracion")`, `revalidatePath("/productos", "layout")`.
- Commits `feat(catalogo): …` con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Borrar un maestro en uso (color con variantes, valor de característica en productos, categoría
   con productos o hijas, marca con productos): bloqueado con el número de usos, nada se borra.
2. Renombrar un color / su hex / una talla: las variantes reflejan el nombre nuevo en `color`,
   `color_hex`, `size` (disparadores), incluso si quien renombra no tiene permiso de Productos.
3. Desactivar un departamento con categorías activas: bloqueado.
4. Nombre repetido con otras mayúsculas («azul marino» vs «Azul Marino»): rechazado.
5. Slug que choca: se genera uno libre (`-2`); renombrar no cambia el slug.

---

### Task 1 (yo): migración `supabase/catalog_view.sql` + prueba con rollback

- Disparadores `SECURITY DEFINER` (`set search_path = ''`): `wm.colors` AFTER UPDATE OF name, hex
  → `product_variants.color/color_hex`; `wm.option_values` AFTER UPDATE OF label →
  `product_variants.size`. Sólo filas que cambian.
- Vista `wm.v_catalog` (`security_invoker = true`), una fila por variante, columnas del spec;
  `grant select … to authenticated`.
- `supabase/tests/catalog_view_rollback.sql`: aplica dentro de una transacción, renombra un color y
  una talla y comprueba variantes, cuenta filas de la vista = variantes, ROLLBACK.
- Aplicar en producción **sólo con confirmación**; plegar a `apply_pending.sh` y bootstrap.

### Task 2 (Codex A): reglas, consulta y acciones de maestros

- `lib/catalog/masters.ts` (+test): `normalizeHex(input): string | null` («#RRGGBB» mayúsculas;
  acepta 3 o 6 dígitos con o sin «#»); `uniqueSlug(base: string, taken: Iterable<string>): string`
  (`slugify` de `lib/catalog-migration/cleanup-plan.ts`; si choca `-2`, `-3`…);
  `sameName(a, b): boolean` (trim + minúsculas + sin acentos); `inUseMessage(count: number,
  what: string, canDeactivate: boolean): string | null` («En uso por N <what>. Desactívalo en su
  lugar.» / sin la segunda frase si no se puede desactivar; null si 0);
  `categoryPlacementError(input: { parentId: string | null; parentIsDepartment: boolean;
  hasChildren: boolean }): string | null` (2 niveles: el padre debe ser departamento; un
  departamento con categorías no puede pasar a tener padre); `departmentDeactivationError(
  activeChildren: number): string | null`.
- `lib/queries/catalog-admin.ts`: `getCatalogAdminData()` según los tipos; conteos en memoria
  (variantes por color/opción, productos por categoría/marca/línea/valor de característica,
  categorías por tipo de opción/característica) con `fetchAllRows`; sin N+1.
- `app/(app)/configuracion/catalog-actions.ts`: implementar todas las firmas con las reglas del spec.
- Quitar `addMaster`/`deleteMaster` de `app/(app)/configuracion/actions.ts`.

### Task 3 (Codex B): interfaz de Configuración → Catálogo

- `components/configuracion/catalogo/*`: `catalogo-section.tsx` (pestañas) + una tarjeta por
  maestro con diálogo crear/editar, flechas de orden, interruptor activo, borrar (deshabilitado
  con el motivo si está en uso).
- `components/configuracion/configuracion-view.tsx`: la sección «Inventario» pasa a «Catálogo»;
  se elimina `MasterCard` y la tarjeta «Tallas». `app/(app)/configuracion/page.tsx` carga
  `getCatalogAdminData()` y `canEditCatalog = canEdit(…, "Inventario")`; deja de cargar
  categorías/marcas/tallas/colores sueltos.

### Task 4 (Codex C): pantalla `/productos/catalogo`

- `lib/queries/catalog-browse.ts` (`getCatalogBrowseData()`), `app/(app)/productos/catalogo/page.tsx`,
  `components/productos/catalogo/*`. Botón «Ver catálogo» en `/productos`.

### Task 5 (yo): verificación, revisión final, docs

- vitest, tsc, eslint, build; navegador (sólo lectura); revisor nuevo; docs (`CLAUDE.md`,
  `docs/PROGRESS.md`, hoja de ruta).
