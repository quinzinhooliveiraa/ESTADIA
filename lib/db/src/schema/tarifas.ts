import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tarifasTable = pgTable("tarifas", {
  id: text("id").primaryKey(),
  valor_ton_hora: real("valor_ton_hora").notNull(),
  vigente_desde: timestamp("vigente_desde", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTarifaSchema = createInsertSchema(tarifasTable);
export type InsertTarifa = z.infer<typeof insertTarifaSchema>;
export type Tarifa = typeof tarifasTable.$inferSelect;
