import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const configuracoesTable = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull().default(""),
});

export const insertConfiguracaoSchema = createInsertSchema(configuracoesTable);
export type InsertConfiguracao = z.infer<typeof insertConfiguracaoSchema>;
export type Configuracao = typeof configuracoesTable.$inferSelect;