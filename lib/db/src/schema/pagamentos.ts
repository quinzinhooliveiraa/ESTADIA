import {
  pgTable,
  text,
  real,
  timestamp,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assinaturasTable } from "./assinaturas";

export const statusPagamentoItemEnum = pgEnum("status_pagamento_item", [
  "pendente",
  "pago",
  "falhou",
]);

export const pagamentosTable = pgTable(
  "pagamentos",
  {
    id: text("id").primaryKey(),
    assinatura_id: text("assinatura_id")
      .notNull()
      .references(() => assinaturasTable.id, { onDelete: "cascade" }),
    abacatepay_charge_id: text("abacatepay_charge_id").notNull(),
    valor: real("valor").notNull(),
    status: statusPagamentoItemEnum("status").notNull().default("pendente"),
    pago_em: timestamp("pago_em", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("pagamentos_charge_id_unique").on(t.abacatepay_charge_id)]
);

export const insertPagamentoSchema = createInsertSchema(pagamentosTable);
export type InsertPagamento = z.infer<typeof insertPagamentoSchema>;
export type Pagamento = typeof pagamentosTable.$inferSelect;
