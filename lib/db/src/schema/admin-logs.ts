import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { motoristasTable } from "./motoristas";

export const adminLogsTable = pgTable("admin_logs", {
  id: text("id").primaryKey(),
  admin_id: text("admin_id")
    .notNull()
    .references(() => motoristasTable.id),
  acao: text("acao").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AdminLog = typeof adminLogsTable.$inferSelect;
