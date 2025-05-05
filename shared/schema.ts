import { pgTable, text, serial, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileImage: text("profile_image"),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: (schema) => schema.min(3, "Username must be at least 3 characters"),
  password: (schema) => schema.min(6, "Password must be at least 6 characters"),
  displayName: (schema) => schema.min(1, "Display name is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Blogs table
export const blogs = pgTable("blogs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  image: text("image"),
  authorId: integer("author_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBlogSchema = createInsertSchema(blogs, {
  title: (schema) => schema.min(1, "Title is required"),
  content: (schema) => schema.min(1, "Content is required"),
});

export type InsertBlog = z.infer<typeof insertBlogSchema>;
export type Blog = typeof blogs.$inferSelect;

// Followers table
export const followers = pgTable("followers", {
  followerId: integer("follower_id").references(() => users.id).notNull(),
  followingId: integer("following_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
  };
});

// Likes table
export const likes = pgTable("likes", {
  userId: integer("user_id").references(() => users.id).notNull(),
  blogId: integer("blog_id").references(() => blogs.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.blogId] }),
  };
});

// Comments table
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  blogId: integer("blog_id").references(() => blogs.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommentSchema = createInsertSchema(comments, {
  content: (schema) => schema.min(1, "Comment cannot be empty"),
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// Bookmarks table
export const bookmarks = pgTable("bookmarks", {
  userId: integer("user_id").references(() => users.id).notNull(),
  blogId: integer("blog_id").references(() => blogs.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.blogId] }),
  };
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  actorId: integer("actor_id").references(() => users.id),
  type: text("type").notNull(), // like, comment, follow, etc.
  blogId: integer("blog_id").references(() => blogs.id),
  commentId: integer("comment_id").references(() => comments.id),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages, {
  content: (schema) => schema.min(1, "Message cannot be empty"),
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  blogs: many(blogs),
  followers: many(followers, { relationName: "followers" }),
  following: many(followers, { relationName: "following" }),
  likes: many(likes),
  comments: many(comments),
  bookmarks: many(bookmarks),
  notificationsReceived: many(notifications, { relationName: "notificationsReceived" }),
  messagesSent: many(messages, { relationName: "messagesSent" }),
  messagesReceived: many(messages, { relationName: "messagesReceived" }),
}));

export const blogsRelations = relations(blogs, ({ one, many }) => ({
  author: one(users, {
    fields: [blogs.authorId],
    references: [users.id],
  }),
  likes: many(likes),
  comments: many(comments),
  bookmarks: many(bookmarks),
}));

export const followersRelations = relations(followers, ({ one }) => ({
  follower: one(users, {
    fields: [followers.followerId],
    references: [users.id],
    relationName: "followers",
  }),
  following: one(users, {
    fields: [followers.followingId],
    references: [users.id],
    relationName: "following",
  }),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
  blog: one(blogs, {
    fields: [likes.blogId],
    references: [blogs.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  blog: one(blogs, {
    fields: [comments.blogId],
    references: [blogs.id],
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  blog: one(blogs, {
    fields: [bookmarks.blogId],
    references: [blogs.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notificationsReceived",
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
  }),
  blog: one(blogs, {
    fields: [notifications.blogId],
    references: [blogs.id],
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: "messagesSent",
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id],
    relationName: "messagesReceived",
  }),
}));

// Add schemas for validation
export const blogInsertSchema = createInsertSchema(blogs, {
  title: (schema) => schema.min(1, "Title is required"),
  content: (schema) => schema.min(1, "Content is required"),
});

export const commentInsertSchema = createInsertSchema(comments, {
  content: (schema) => schema.min(1, "Comment cannot be empty"),
});

export const messageInsertSchema = createInsertSchema(messages, {
  content: (schema) => schema.min(1, "Message cannot be empty"),
});
