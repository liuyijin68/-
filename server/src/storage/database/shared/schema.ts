import { sql } from "drizzle-orm";
import { pgTable, serial, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ========== 养成系统表 ==========

// 用户表
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_username_idx").on(table.username),
  ]
);

// 用户进度表（积分余额 + 累计掌握单词数）
export const userProgress = pgTable(
  "user_progress",
  {
    id: serial("id").primaryKey(),
    user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull().default(0),
    mastered_words: integer("mastered_words").notNull().default(0),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_progress_user_id_idx").on(table.user_id),
  ]
);

// 积分历史表
export const pointsHistory = pgTable(
  "points_history",
  {
    id: serial("id").primaryKey(),
    user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(), // 'earn' | 'spend'
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("points_history_user_id_idx").on(table.user_id),
    index("points_history_created_at_idx").on(table.created_at),
  ]
);
