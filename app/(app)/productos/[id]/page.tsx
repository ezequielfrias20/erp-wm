import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getProductDetail, getCatalogRefs } from "@/lib/queries/products";
import { getProductEditorData, getCatalogMasters } from "@/lib/queries/catalog";
import { canView, canEdit } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { ProductEditor } from "@/components/productos/product-editor";
import { productImageUrl } from "@/lib/product-images";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Productos")) redirect("/dashboard");

  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const [editorData, masters, detail, refs] = await Promise.all([
    getProductEditorData(id),
    getCatalogMasters(),
    getProductDetail(id, branchId),
    getCatalogRefs(),
  ]);
  if (!editorData || !detail?.product) notFound();

  return (
    <ProductEditor
      editorData={editorData}
      masters={masters}
      productImageUrl={productImageUrl(detail.product.id, detail.product.updated_at)}
      variants={detail.variants}
      byBranch={detail.byBranch}
      sizes={refs.sizes}
      colors={refs.colors}
      canEdit={canEdit(session.permissions, "Productos")}
    />
  );
}
