import mongoose, { Schema, Document } from 'mongoose';
import { z } from 'zod';

// Define interfaces for our documents
export interface IUser extends Document {
  username: string;
  password: string;
  displayName: string;
  bio?: string;
  profileImage?: string;
  coverImage?: string;
  createdAt: Date;
}

export interface IBlog extends Document {
  title: string;
  content: string;
  image?: string;
  author: mongoose.Types.ObjectId | IUser;
  category?: string;
  hashtags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment extends Document {
  content: string;
  user: mongoose.Types.ObjectId | IUser;
  blog: mongoose.Types.ObjectId | IBlog;
  createdAt: Date;
}

export interface ILike extends Document {
  user: mongoose.Types.ObjectId | IUser;
  blog: mongoose.Types.ObjectId | IBlog;
  createdAt: Date;
}

export interface IBookmark extends Document {
  user: mongoose.Types.ObjectId | IUser;
  blog: mongoose.Types.ObjectId | IBlog;
  createdAt: Date;
}

export interface IFollower extends Document {
  follower: mongoose.Types.ObjectId | IUser;
  following: mongoose.Types.ObjectId | IUser;
  createdAt: Date;
}

export interface INotification extends Document {
  user: mongoose.Types.ObjectId | IUser;
  actor?: mongoose.Types.ObjectId | IUser;
  type: string;
  blog?: mongoose.Types.ObjectId | IBlog;
  comment?: mongoose.Types.ObjectId | IComment;
  read: boolean;
  createdAt: Date;
}

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId | IUser;
  receiver: mongoose.Types.ObjectId | IUser;
  content: string;
  read: boolean;
  createdAt: Date;
  messageType?: string; // 'text' or 'blog_share'
  sharedBlog?: mongoose.Types.ObjectId | IBlog;
  sharedBlogPreview?: {
    title: string;
    excerpt: string;
    image?: string;
  };
}

// Create schemas
const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  displayName: { type: String, required: true },
  bio: { type: String },
  profileImage: { type: String },
  coverImage: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const BlogSchema = new Schema<IBlog>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  image: { type: String },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String },
  hashtags: { type: [String] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CommentSchema = new Schema<IComment>({
  content: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  blog: { type: Schema.Types.ObjectId, ref: 'Blog', required: true },
  createdAt: { type: Date, default: Date.now }
});

const LikeSchema = new Schema<ILike>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  blog: { type: Schema.Types.ObjectId, ref: 'Blog', required: true },
  createdAt: { type: Date, default: Date.now }
});

const BookmarkSchema = new Schema<IBookmark>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  blog: { type: Schema.Types.ObjectId, ref: 'Blog', required: true },
  createdAt: { type: Date, default: Date.now }
});

const FollowerSchema = new Schema<IFollower>({
  follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  following: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  blog: { type: Schema.Types.ObjectId, ref: 'Blog' },
  comment: { type: Schema.Types.ObjectId, ref: 'Comment' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new Schema<IMessage>({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  messageType: { type: String, enum: ['text', 'blog_share'], default: 'text' },
  sharedBlog: { type: Schema.Types.ObjectId, ref: 'Blog' },
  sharedBlogPreview: {
    title: { type: String },
    excerpt: { type: String },
    image: { type: String }
  }
});

// Set unique compound indexes
LikeSchema.index({ user: 1, blog: 1 }, { unique: true });
BookmarkSchema.index({ user: 1, blog: 1 }, { unique: true });
FollowerSchema.index({ follower: 1, following: 1 }, { unique: true });

// Create models
export const User = mongoose.model<IUser>('User', UserSchema);
export const Blog = mongoose.model<IBlog>('Blog', BlogSchema);
export const Comment = mongoose.model<IComment>('Comment', CommentSchema);
export const Like = mongoose.model<ILike>('Like', LikeSchema);
export const Bookmark = mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
export const Follower = mongoose.model<IFollower>('Follower', FollowerSchema);
export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
export const Message = mongoose.model<IMessage>('Message', MessageSchema);

// Validation schemas
export const userInsertSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  profileImage: z.string().optional(),
  coverImage: z.string().optional()
});

export const blogInsertSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  image: z.string().optional(),
  category: z.string().optional(),
  hashtags: z.array(z.string()).optional()
});

export const commentInsertSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty")
});

export const messageInsertSchema = z.object({
  content: z.string().min(1, "Message cannot be empty"),
  messageType: z.enum(['text', 'blog_share']).optional().default('text'),
  sharedBlogId: z.string().optional(),
  sharedBlogPreview: z.object({
    title: z.string(),
    excerpt: z.string(),
    image: z.string().optional()
  }).optional()
});

// Type definitions for the zod schemas
export type UserInsert = z.infer<typeof userInsertSchema>;
export type BlogInsert = z.infer<typeof blogInsertSchema>;
export type CommentInsert = z.infer<typeof commentInsertSchema>;
export type MessageInsert = z.infer<typeof messageInsertSchema>;