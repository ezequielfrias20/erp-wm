import { NextResponse } from "next/server";
import { fetchBcvRate, BCV_FALLBACK } from "@/lib/bcv";

export const revalidate = 3600;

export async function GET() {
  try {
    const rate = await fetchBcvRate();
    return NextResponse.json(rate);
  } catch {
    return NextResponse.json({
      rate: BCV_FALLBACK,
      updatedAt: new Date().toISOString(),
      source: "BCV",
    });
  }
}
