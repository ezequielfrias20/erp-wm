import { redirect } from "next/navigation";
import { getSession } from "@/lib/queries/session";
import { listProducts, getCatalogRefs } from "@/lib/queries/products";
import { canView, canEdit } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { ProductsView } from "@/components/productos/products-view";

export const metadata = { title: "Productos · World Medics ERP" };

export default async function ProductosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Productos")) redirect("/dashboard");

  const branchId = await getActiveBranchId(
    session.profile.branch_id,
    session.profile.role,
  );
  const [products, refs] = await Promise.all([
    listProducts(branchId),
    getCatalogRefs(),
  ]);

  return (
    <ProductsView
      products={products}
      categories={refs.categories}
      brands={refs.brands}
      sizes={refs.sizes}
      colors={refs.colors}
      canEdit={canEdit(session.permissions, "Productos")}
    />
  );
}
