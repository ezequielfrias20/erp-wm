import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getProductEditorData, getCatalogMasters } from "@/lib/queries/catalog";
import { canView, canEdit } from "@/lib/permissions";
import { getProfileBranchScope } from "@/lib/branch";
import { ProductEditor } from "@/components/productos/product-editor";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Productos")) redirect("/dashboard");

  // Un usuario limitado a una sucursal sólo ve el stock de la suya.
  const branchScope = getProfileBranchScope(session.profile);
  const [editorData, masters] = await Promise.all([
    getProductEditorData(id, branchScope),
    getCatalogMasters(),
  ]);
  if (!editorData) notFound();

  return (
    <ProductEditor
      editorData={editorData}
      masters={masters}
      canEdit={canEdit(session.permissions, "Productos")}
      canEditStock={canEdit(session.permissions, "Inventario")}
    />
  );
}
