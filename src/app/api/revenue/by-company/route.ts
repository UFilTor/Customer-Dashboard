import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.CANOPY_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.CANOPY_GATEWAY_API_KEY;

export async function GET() {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json(
      { error: "Canopy gateway not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/metrics/revenue_by_company/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Gateway error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch revenue by company", detail: String(err) },
      { status: 500 }
    );
  }
}
