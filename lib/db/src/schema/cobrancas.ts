import {
  pgTable,
  text,
  real,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { esperasTable } from "./esperas";

export const statusPagamentoEnum = pgEnum("status_pagamento", [
  "pendente",
  "pago",
]);

export const cobrancasTable = pgTable("cobrancas", {
  id: text("id").primaryKey(),
  espera_id: text("espera_id")
    .notNull()
    .references(() => esperasTable.id, { onDelete: "cascade" }),
  pdf_url: text("pdf_url"),
  token_verificacao: text("token_verificacao").notNull().unique(),
  valor: real("valor").notNull(),
  status_pagamento: statusPagamentoEnum("status_pagamento")
    .notNull()
    .default("pendente"),
  enviada_via: text("enviada_via"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCobrancaSchema = createInsertSchema(cobrancasTable);
export type InsertCobranca = z.infer<typeof insertCobrancaSchema>;
export type Cobranca = typeof cobrancasTable.$inferSelect;
