import {
  pgTable,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { motoristasTable } from "./motoristas";

export const statusAssinaturaEnum = pgEnum("status_assinatura", [
  "pendente",
  "ativo",
  "cancelado",
  "expirado",
]);

export const metodoAssinaturaEnum = pgEnum("metodo_assinatura", [
  "pix",
  "cartao",
]);

export const planoAssinaturaEnum = pgEnum("plano_assinatura", [
  "gratis",
  "pro_mensal",
  "pro_anual",
]);

export const assinaturasTable = pgTable("assinaturas", {
  id: text("id").primaryKey(),
  motorista_id: text("motorista_id")
    .notNull()
    .references(() => motoristasTable.id, { onDelete: "cascade" }),
  plano: planoAssinaturaEnum("plano").notNull(),
  status: statusAssinaturaEnum("status").notNull().default("pendente"),
  expira_em: timestamp("expira_em", { withTimezone: true }),
  abacatepay_billing_id: text("abacatepay_billing_id"),
  abacatepay_subscription_id: text("abacatepay_subscription_id"),
  metodo: metodoAssinaturaEnum("metodo"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAssinaturaSchema = createInsertSchema(assinaturasTable);
export type InsertAssinatura = z.infer<typeof insertAssinaturaSchema>;
export type Assinatura = typeof assinaturasTable.$inferSelect;
