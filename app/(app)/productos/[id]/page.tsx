import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { getProductDetail, getCatalogRefs } from "@/lib/queries/products";
import { canView, canEdit } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
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

  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const [detail, refs] = await Promise.all([
    getProductDetail(id, branchId),
    getCatalogRefs(),
  ]);
  if (!detail?.product) notFound();

  return (
    <ProductEditor
      product={detail.product}
      variants={detail.variants}
      byBranch={detail.byBranch}
      categories={refs.categories}
      brands={refs.brands}
      sizes={refs.sizes}
      colors={refs.colors}
      canEdit={canEdit(session.permissions, "Productos")}
    />
  );
}
