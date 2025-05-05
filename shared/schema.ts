import { z } from "zod";
import {
  User as UserModel,
  Blog as BlogModel,
  Comment as CommentModel,
  Like as LikeModel,
  Bookmark as BookmarkModel,
  Follower as FollowerModel,
  Notification as NotificationModel,
  Message as MessageModel,
  userInsertSchema,
  blogInsertSchema,
  commentInsertSchema,
  messageInsertSchema,
  UserInsert,
  BlogInsert,
  CommentInsert,
  MessageInsert,
  IUser,
  IBlog,
  IComment,
  ILike,
  IBookmark,
  IFollower,
  INotification,
  IMessage
} from "../db/models";

// Export models
export const userModel = UserModel;
export const blogModel = BlogModel;
export const commentModel = CommentModel;
export const likeModel = LikeModel;
export const bookmarkModel = BookmarkModel;
export const followerModel = FollowerModel;
export const notificationModel = NotificationModel;
export const messageModel = MessageModel;

// Export schemas and types
export { 
  userInsertSchema as insertUserSchema,
  blogInsertSchema as insertBlogSchema,
  commentInsertSchema as insertCommentSchema,
  messageInsertSchema as insertMessageSchema
};

// Type definitions to maintain compatibility with existing code
export type InsertUser = UserInsert;
export type InsertBlog = BlogInsert;
export type InsertComment = CommentInsert;
export type InsertMessage = MessageInsert;

// Type interfaces for models
export type User = IUser;
export type Blog = IBlog;
export type Comment = IComment;
export type Like = ILike;
export type Bookmark = IBookmark;
export type Follower = IFollower;
export type Notification = INotification;
export type Message = IMessage;

// Define additional schemas for frontend validation
export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  displayName: z.string().min(1, "Display name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  bio: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const profileFormSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  profileImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  coverImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});
