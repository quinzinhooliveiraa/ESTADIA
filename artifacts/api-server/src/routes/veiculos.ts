import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { veiculosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  CreateVeiculoBody,
  UpdateVeiculoBody,
  UpdateVeiculoParams,
  DeleteVeiculoParams,
  SetVeiculoPadraoParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /veiculos
router.get("/veiculos", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.motorista_id, motoristaId));
  res.json(veiculos);
});

// POST /veiculos
router.post("/veiculos", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const parsed = CreateVeiculoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = randomUUID();
  await db.insert(veiculosTable).values({
    id,
    motorista_id: motoristaId,
    ...parsed.data,
  });

  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.id, id))
    .limit(1);

  res.status(201).json(veiculos[0]);
});

// PUT /veiculos/:id
router.put("/veiculos/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = UpdateVeiculoParams.safeParse(req.params);
  const body = UpdateVeiculoBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  await db
    .update(veiculosTable)
    .set(body.data)
    .where(
      and(
        eq(veiculosTable.id, params.data.id),
        eq(veiculosTable.motorista_id, motoristaId)
      )
    );

  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.id, params.data.id))
    .limit(1);

  if (veiculos.length === 0) {
    res.status(404).json({ error: "Veículo não encontrado" });
    return;
  }

  res.json(veiculos[0]);
});

// DELETE /veiculos/:id
router.delete("/veiculos/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = DeleteVeiculoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  await db
    .delete(veiculosTable)
    .where(
      and(
        eq(veiculosTable.id, params.data.id),
        eq(veiculosTable.motorista_id, motoristaId)
      )
    );

  res.json({ message: "Veículo excluído" });
});

// PATCH /veiculos/:id/padrao
router.patch("/veiculos/:id/padrao", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = SetVeiculoPadraoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // Unset all defaults for this motorista
  await db
    .update(veiculosTable)
    .set({ is_padrao: false })
    .where(eq(veiculosTable.motorista_id, motoristaId));

  // Set the new default
  await db
    .update(veiculosTable)
    .set({ is_padrao: true })
    .where(
      and(
        eq(veiculosTable.id, params.data.id),
        eq(veiculosTable.motorista_id, motoristaId)
      )
    );

  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.id, params.data.id))
    .limit(1);

  if (veiculos.length === 0) {
    res.status(404).json({ error: "Veículo não encontrado" });
    return;
  }

  res.json(veiculos[0]);
});

export default router;
