import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tarifasTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /tarifas/vigente
router.get("/tarifas/vigente", async (req, res): Promise<void> => {
  const tarifas = await db
    .select()
    .from(tarifasTable)
    .orderBy(desc(tarifasTable.vigente_desde))
    .limit(1);

  if (tarifas.length === 0) {
    // Default rate per Brazilian law (R$1.90/ton/hour)
    res.json({
      id: "default",
      valor_ton_hora: 1.9,
      vigente_desde: new Date("2024-01-01").toISOString(),
    });
    return;
  }

  res.json(tarifas[0]);
});

export default router;
