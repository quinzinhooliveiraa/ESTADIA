import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tipoMotoristaEnum = pgEnum("tipo_motorista", [
  "TAC autônomo",
  "ETC frota",
]);

export const planoEnum = pgEnum("plano", ["gratis", "pro_mensal", "pro_anual"]);

export const motoristasTable = pgTable("motoristas", {
  id: text("id").primaryKey(),
  telefone: text("telefone").notNull().unique(),
  nome: text("nome"),
  tipo: tipoMotoristaEnum("tipo"),
  plano: planoEnum("plano").notNull().default("gratis"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMotoristaSchema = createInsertSchema(motoristasTable);
export type InsertMotorista = z.infer<typeof insertMotoristaSchema>;
export type Motorista = typeof motoristasTable.$inferSelect;
