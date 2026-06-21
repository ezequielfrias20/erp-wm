"use client";

/**
 * Reporte de ventas en PDF con membrete (logo + datos de empresa), generado con
 * @react-pdf/renderer (archivo .pdf vectorial descargable, no captura de pantalla).
 */

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { fmtUSD, fmtVES, fmtDate } from "@/lib/format";
import type { ReportData } from "@/lib/queries/reports";
import type { InvoiceCompany } from "@/components/factura/invoice-template";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#0B0F19", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#0EA5E9",
    paddingBottom: 12,
    marginBottom: 14,
  },
  logo: { height: 42, objectFit: "contain", marginRight: 10 },
  company: { fontSize: 14, fontWeight: 700 },
  muted: { color: "#64748B", fontSize: 8 },
  title: { fontSize: 16, fontWeight: 700, color: "#0EA5E9", textAlign: "right" },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 8,
  },
  kpiLabel: { color: "#64748B", fontSize: 7, marginBottom: 3 },
  kpiValue: { fontSize: 12, fontWeight: 700 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, marginTop: 8 },
  trow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 4,
  },
  th: { fontSize: 7.5, color: "#64748B", textTransform: "uppercase", fontWeight: 700 },
  cell: { fontSize: 8.5 },
  right: { textAlign: "right" },
});

function Th({ children, w, right }: { children: React.ReactNode; w: string; right?: boolean }) {
  return <Text style={[s.th, { width: w }, right ? s.right : {}]}>{children}</Text>;
}
function Td({ children, w, right }: { children: React.ReactNode; w: string; right?: boolean }) {
  return <Text style={[s.cell, { width: w }, right ? s.right : {}]}>{children}</Text>;
}

function ReportPDFDoc({
  data,
  company,
  branchLabel,
}: {
  data: ReportData;
  company: InvoiceCompany;
  branchLabel: string;
}) {
  const { kpis, monthly, byPayment, sales, range, rate, cashea } = data;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image no admite alt */}
            {company.logoUrl ? <Image src={company.logoUrl} style={s.logo} /> : null}
            <View>
              <Text style={s.company}>{company.name ?? "World Medics"}</Text>
              {company.rif ? <Text style={s.muted}>RIF: {company.rif}</Text> : null}
              {company.address ? <Text style={s.muted}>{company.address}</Text> : null}
              {company.phone ? <Text style={s.muted}>Tel: {company.phone}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={s.title}>REPORTE DE VENTAS</Text>
            <Text style={[s.muted, s.right]}>
              {fmtDate(range.from)} – {fmtDate(range.to)}
            </Text>
            <Text style={[s.muted, s.right]}>Sucursal: {branchLabel}</Text>
            <Text style={[s.muted, s.right]}>Tasa BCV: {fmtVES(rate)}/USD</Text>
          </View>
        </View>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>INGRESOS</Text>
            <Text style={s.kpiValue}>{fmtUSD(kpis.ingresos)}</Text>
            <Text style={s.muted}>{fmtVES(kpis.ingresos * rate)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>GANANCIA</Text>
            <Text style={s.kpiValue}>{fmtUSD(kpis.ganancia)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>MARGEN</Text>
            <Text style={s.kpiValue}>{kpis.margen.toFixed(1)}%</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>TRANSACCIONES</Text>
            <Text style={s.kpiValue}>{kpis.transacciones}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Por método de pago</Text>
        <View style={s.trow}>
          <Th w="34%">Método</Th>
          <Th w="14%">Moneda</Th>
          <Th w="26%" right>
            Monto nativo
          </Th>
          <Th w="26%" right>
            Equivalente USD
          </Th>
        </View>
        {byPayment.map((p) => (
          <View style={s.trow} key={p.name}>
            <Td w="34%">{p.is_financed ? `${p.name} (por cobrar)` : p.name}</Td>
            <Td w="14%">{p.currency}</Td>
            <Td w="26%" right>
              {p.currency === "VES" ? fmtVES(p.native) : fmtUSD(p.native)}
            </Td>
            <Td w="26%" right>
              {fmtUSD(p.usd)}
            </Td>
          </View>
        ))}

        {cashea.ventasCashea > 0 ? (
          <>
            <Text style={s.sectionTitle}>Cashea · conciliación</Text>
            <View style={s.trow}>
              <Td w="50%">Ventas Cashea</Td>
              <Td w="50%" right>
                {fmtUSD(cashea.ventasCashea)}
              </Td>
            </View>
            <View style={s.trow}>
              <Td w="50%">Inicial cobrada (caja)</Td>
              <Td w="50%" right>
                {fmtUSD(cashea.inicialCobrado)}
              </Td>
            </View>
            <View style={s.trow}>
              <Td w="50%">Por cobrar a Cashea</Td>
              <Td w="50%" right>
                {fmtUSD(cashea.porCobrar)}
              </Td>
            </View>
            <View style={s.trow}>
              <Td w="50%">Cobrado a Cashea</Td>
              <Td w="50%" right>
                {fmtUSD(cashea.cobrado)}
              </Td>
            </View>
            <View style={s.trow}>
              <Td w="50%">Comisión Cashea</Td>
              <Td w="50%" right>
                {fmtUSD(cashea.comisionTotal)}
              </Td>
            </View>
            <View style={s.trow}>
              <Th w="34%">Canal</Th>
              <Th w="22%" right>
                Ventas
              </Th>
              <Th w="22%" right>
                Por cobrar
              </Th>
              <Th w="22%" right>
                Comisión
              </Th>
            </View>
            {(
              [
                { label: "Tienda", c: cashea.tienda },
                { label: "Online", c: cashea.online },
              ] as const
            ).map((row) => (
              <View style={s.trow} key={row.label}>
                <Td w="34%">{row.label}</Td>
                <Td w="22%" right>
                  {fmtUSD(row.c.ventas)}
                </Td>
                <Td w="22%" right>
                  {fmtUSD(row.c.porCobrar)}
                </Td>
                <Td w="22%" right>
                  {fmtUSD(row.c.comision)}
                </Td>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.sectionTitle}>Desglose mensual</Text>
        <View style={s.trow}>
          <Th w="28%">Mes</Th>
          <Th w="20%" right>
            Ingresos
          </Th>
          <Th w="18%" right>
            Costo
          </Th>
          <Th w="18%" right>
            Ganancia
          </Th>
          <Th w="16%" right>
            Tx
          </Th>
        </View>
        {monthly.map((m) => (
          <View style={s.trow} key={m.mes}>
            <Td w="28%">{m.mes}</Td>
            <Td w="20%" right>
              {fmtUSD(m.ingresos)}
            </Td>
            <Td w="18%" right>
              {fmtUSD(m.costo)}
            </Td>
            <Td w="18%" right>
              {fmtUSD(m.ganancia)}
            </Td>
            <Td w="16%" right>
              {m.tx}
            </Td>
          </View>
        ))}

        <Text style={s.sectionTitle}>Ventas del período ({sales.length})</Text>
        <View style={s.trow}>
          <Th w="16%">Factura</Th>
          <Th w="22%">Fecha</Th>
          <Th w="26%">Cliente</Th>
          <Th w="18%">Método</Th>
          <Th w="18%" right>
            Total
          </Th>
        </View>
        {sales.slice(0, 60).map((v) => (
          <View style={s.trow} key={v.id}>
            <Td w="16%">{v.invoice_number}</Td>
            <Td w="22%">{fmtDate(v.created_at)}</Td>
            <Td w="26%">{v.customer ?? "Cliente general"}</Td>
            <Td w="18%">{v.payment_method ?? "—"}</Td>
            <Td w="18%" right>
              {fmtUSD(v.total)}
            </Td>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function downloadReportPdf(
  data: ReportData,
  company: InvoiceCompany,
  branchLabel: string,
): Promise<void> {
  const blob = await pdf(
    <ReportPDFDoc data={data} company={company} branchLabel={branchLabel} />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-ventas-${data.range.from}_${data.range.to}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
