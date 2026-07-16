import {
  pgTable,
  text,
  real,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { motoristasTable } from "./motoristas";

export const veiculosTable = pgTable("veiculos", {
  id: text("id").primaryKey(),
  motorista_id: text("motorista_id")
    .notNull()
    .references(() => motoristasTable.id, { onDelete: "cascade" }),
  placa: text("placa").notNull(),
  capacidade_ton: real("capacidade_ton").notNull(),
  tipo: text("tipo").notNull(),
  is_padrao: boolean("is_padrao").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertVeiculoSchema = createInsertSchema(veiculosTable);
export type InsertVeiculo = z.infer<typeof insertVeiculoSchema>;
export type Veiculo = typeof veiculosTable.$inferSelect;
