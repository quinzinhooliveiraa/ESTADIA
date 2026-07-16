import {
  pgTable,
  text,
  real,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { motoristasTable } from "./motoristas";
import { veiculosTable } from "./veiculos";

export const statusEsperaEnum = pgEnum("status_espera", [
  "aguardando",
  "encerrada",
  "cobranca_gerada",
]);

export const esperasTable = pgTable("esperas", {
  id: text("id").primaryKey(),
  motorista_id: text("motorista_id")
    .notNull()
    .references(() => motoristasTable.id, { onDelete: "cascade" }),
  veiculo_id: text("veiculo_id")
    .notNull()
    .references(() => veiculosTable.id),
  // Server-recorded arrival (immutable after creation)
  chegada_ts: timestamp("chegada_ts", { withTimezone: true }).notNull(),
  // Device-reported arrival time
  chegada_device_ts: timestamp("chegada_device_ts", { withTimezone: true }),
  chegada_lat: real("chegada_lat"),
  chegada_lng: real("chegada_lng"),
  chegada_precisao_m: real("chegada_precisao_m"),
  chegada_endereco: text("chegada_endereco"),
  saida_ts: timestamp("saida_ts", { withTimezone: true }),
  status: statusEsperaEnum("status").notNull().default("aguardando"),
  embarcador_nome: text("embarcador_nome"),
  embarcador_cnpj: text("embarcador_cnpj"),
  local_descricao: text("local_descricao"),
  // JSON array of photo URLs
  fotos: text("fotos").notNull().default("[]"),
  // Snapshot of the tarifa at time of record
  tarifa_ton_hora: real("tarifa_ton_hora").notNull(),
  valor_calculado: real("valor_calculado"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEsperaSchema = createInsertSchema(esperasTable);
export type InsertEspera = z.infer<typeof insertEsperaSchema>;
export type Espera = typeof esperasTable.$inferSelect;
