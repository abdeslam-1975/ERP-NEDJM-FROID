import { NextResponse } from "next/server";
import { buildEmptyCanvaWorkbook } from "@/lib/contracts/canva-excel";
import { requireContractAccess } from "@/lib/auth/require-roles";

export async function GET() {
  const gate = await requireContractAccess();
  if (!gate.ok) {
    const status = gate.error.includes("Session") ? 401 : 403;
    return NextResponse.json({ error: gate.error }, { status });
  }

  const buffer = await buildEmptyCanvaWorkbook();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="NEDJM_FROID_Canva_Contrats.xlsx"',
    },
  });
}
