import { redirect } from "next/navigation";
import { CatalogBrowser } from "@/components/productos/catalogo/catalog-browser";
import { canView } from "@/lib/permissions";
import { getCatalogBrowseData } from "@/lib/queries/catalog-browse";
import { getSession } from "@/lib/queries/session";

export const metadata = { title: "Catálogo" };

export default async function CatalogoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canView(session.permissions, "Productos")) redirect("/dashboard");

  const data = await getCatalogBrowseData();
  return <CatalogBrowser data={data} />;
}
