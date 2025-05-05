import { db } from "@db";
import * as schema from "@shared/schema";
import { eq, and, desc, or, asc, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "@db";
import { WebSocketServer } from "ws";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User methods
  getUser: (id: number) => Promise<schema.User | undefined>;
  getUserByUsername: (username: string) => Promise<schema.User | undefined>;
  createUser: (user: Omit<schema.InsertUser, "profileImage" | "coverImage" | "bio"> & { 
    profileImage?: string;
    coverImage?: string;
    bio?: string;
  }) => Promise<schema.User>;
  updateUser: (id: number, userData: Partial<schema.User>) => Promise<schema.User | undefined>;
  
  // Blog methods
  getBlogs: (limit?: number, offset?: number) => Promise<(schema.Blog & { author: schema.User })[]>;
  getBlogsByUser: (userId: number, limit?: number, offset?: number) => Promise<(schema.Blog & { author: schema.User })[]>;
  getBlogsByFollowing: (userId: number, limit?: number, offset?: number) => Promise<(schema.Blog & { author: schema.User })[]>;
  getBlog: (id: number) => Promise<(schema.Blog & { author: schema.User }) | undefined>;
  createBlog: (blog: Omit<schema.InsertBlog, "authorId" | "createdAt" | "updatedAt"> & { authorId: number }) => Promise<schema.Blog>;
  updateBlog: (id: number, blogData: Partial<schema.Blog>) => Promise<schema.Blog | undefined>;
  deleteBlog: (id: number) => Promise<boolean>;
  
  // Follower methods
  followUser: (followerId: number, followingId: number) => Promise<boolean>;
  unfollowUser: (followerId: number, followingId: number) => Promise<boolean>;
  getFollowers: (userId: number) => Promise<schema.User[]>;
  getFollowing: (userId: number) => Promise<schema.User[]>;
  isFollowing: (followerId: number, followingId: number) => Promise<boolean>;
  
  // Like methods
  likeBlog: (userId: number, blogId: number) => Promise<boolean>;
  unlikeBlog: (userId: number, blogId: number) => Promise<boolean>;
  isLikedByUser: (userId: number, blogId: number) => Promise<boolean>;
  getLikeCount: (blogId: number) => Promise<number>;
  
  // Comment methods
  getComments: (blogId: number) => Promise<(schema.Comment & { user: schema.User })[]>;
  createComment: (comment: Omit<schema.InsertComment, "userId" | "createdAt"> & { userId: number }) => Promise<schema.Comment>;
  deleteComment: (id: number) => Promise<boolean>;
  
  // Bookmark methods
  bookmarkBlog: (userId: number, blogId: number) => Promise<boolean>;
  unbookmarkBlog: (userId: number, blogId: number) => Promise<boolean>;
  isBookmarkedByUser: (userId: number, blogId: number) => Promise<boolean>;
  getBookmarks: (userId: number) => Promise<(schema.Blog & { author: schema.User })[]>;
  
  // Notification methods
  createNotification: (notification: { 
    userId: number, 
    actorId?: number, 
    type: string, 
    blogId?: number, 
    commentId?: number 
  }) => Promise<schema.Notification>;
  getNotifications: (userId: number, limit?: number, offset?: number) => Promise<(schema.Notification & { 
    actor?: schema.User, 
    blog?: schema.Blog 
  })[]>;
  markNotificationAsRead: (id: number) => Promise<boolean>;
  markAllNotificationsAsRead: (userId: number) => Promise<boolean>;
  getUnreadNotificationCount: (userId: number) => Promise<number>;
  
  // Message methods
  getMessages: (userId1: number, userId2: number, limit?: number, offset?: number) => Promise<schema.Message[]>;
  sendMessage: (message: Omit<schema.InsertMessage, "createdAt" | "read">) => Promise<schema.Message>;
  markMessageAsRead: (id: number) => Promise<boolean>;
  markAllMessagesAsRead: (senderId: number, receiverId: number) => Promise<boolean>;
  getConversations: (userId: number) => Promise<{ user: schema.User, lastMessage: schema.Message, unreadCount: number }[]>;
  
  // Search methods
  searchUsers: (query: string) => Promise<schema.User[]>;
  searchBlogs: (query: string) => Promise<(schema.Blog & { author: schema.User })[]>;
  
  // Trending methods
  getTrendingBlogs: (limit?: number) => Promise<(schema.Blog & { author: schema.User, likeCount: number, commentCount: number })[]>;
  
  // Session store for authentication
  sessionStore: session.SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.SessionStore;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }
  
  // User methods
  async getUser(id: number): Promise<schema.User | undefined> {
    const users = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return users[0];
  }
  
  async getUserByUsername(username: string): Promise<schema.User | undefined> {
    const users = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return users[0];
  }
  
  async createUser(user: Omit<schema.InsertUser, "profileImage" | "coverImage" | "bio"> & { 
    profileImage?: string;
    coverImage?: string;
    bio?: string;
  }): Promise<schema.User> {
    const [newUser] = await db.insert(schema.users).values(user).returning();
    return newUser;
  }
  
  async updateUser(id: number, userData: Partial<schema.User>): Promise<schema.User | undefined> {
    const [updatedUser] = await db.update(schema.users)
      .set(userData)
      .where(eq(schema.users.id, id))
      .returning();
    return updatedUser;
  }
  
  // Blog methods
  async getBlogs(limit = 10, offset = 0): Promise<(schema.Blog & { author: schema.User })[]> {
    return await db.query.blogs.findMany({
      with: { author: true },
      orderBy: desc(schema.blogs.createdAt),
      limit,
      offset
    });
  }
  
  async getBlogsByUser(userId: number, limit = 10, offset = 0): Promise<(schema.Blog & { author: schema.User })[]> {
    return await db.query.blogs.findMany({
      where: eq(schema.blogs.authorId, userId),
      with: { author: true },
      orderBy: desc(schema.blogs.createdAt),
      limit,
      offset
    });
  }
  
  async getBlogsByFollowing(userId: number, limit = 10, offset = 0): Promise<(schema.Blog & { author: schema.User })[]> {
    const followingUsers = await db.select({ followingId: schema.followers.followingId })
      .from(schema.followers)
      .where(eq(schema.followers.followerId, userId));
      
    const followingIds = followingUsers.map(f => f.followingId);
    
    if (followingIds.length === 0) {
      return [];
    }
    
    return await db.query.blogs.findMany({
      where: sql`${schema.blogs.authorId} IN ${followingIds}`,
      with: { author: true },
      orderBy: desc(schema.blogs.createdAt),
      limit,
      offset
    });
  }
  
  async getBlog(id: number): Promise<(schema.Blog & { author: schema.User }) | undefined> {
    return await db.query.blogs.findFirst({
      where: eq(schema.blogs.id, id),
      with: { author: true }
    });
  }
  
  async createBlog(blog: Omit<schema.InsertBlog, "authorId" | "createdAt" | "updatedAt"> & { authorId: number }): Promise<schema.Blog> {
    const [newBlog] = await db.insert(schema.blogs).values(blog).returning();
    return newBlog;
  }
  
  async updateBlog(id: number, blogData: Partial<schema.Blog>): Promise<schema.Blog | undefined> {
    const [updatedBlog] = await db.update(schema.blogs)
      .set({ ...blogData, updatedAt: new Date() })
      .where(eq(schema.blogs.id, id))
      .returning();
    return updatedBlog;
  }
  
  async deleteBlog(id: number): Promise<boolean> {
    const deleted = await db.delete(schema.blogs).where(eq(schema.blogs.id, id)).returning();
    return deleted.length > 0;
  }
  
  // Follower methods
  async followUser(followerId: number, followingId: number): Promise<boolean> {
    try {
      await db.insert(schema.followers).values({ followerId, followingId }).returning();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async unfollowUser(followerId: number, followingId: number): Promise<boolean> {
    const deleted = await db.delete(schema.followers)
      .where(and(
        eq(schema.followers.followerId, followerId),
        eq(schema.followers.followingId, followingId)
      ))
      .returning();
    return deleted.length > 0;
  }
  
  async getFollowers(userId: number): Promise<schema.User[]> {
    const followers = await db.select()
      .from(schema.followers)
      .where(eq(schema.followers.followingId, userId))
      .innerJoin(schema.users, eq(schema.followers.followerId, schema.users.id));
    
    return followers.map(f => f.users);
  }
  
  async getFollowing(userId: number): Promise<schema.User[]> {
    const following = await db.select()
      .from(schema.followers)
      .where(eq(schema.followers.followerId, userId))
      .innerJoin(schema.users, eq(schema.followers.followingId, schema.users.id));
    
    return following.map(f => f.users);
  }
  
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const result = await db.select()
      .from(schema.followers)
      .where(and(
        eq(schema.followers.followerId, followerId),
        eq(schema.followers.followingId, followingId)
      ))
      .limit(1);
    
    return result.length > 0;
  }
  
  // Like methods
  async likeBlog(userId: number, blogId: number): Promise<boolean> {
    try {
      await db.insert(schema.likes).values({ userId, blogId }).returning();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async unlikeBlog(userId: number, blogId: number): Promise<boolean> {
    const deleted = await db.delete(schema.likes)
      .where(and(
        eq(schema.likes.userId, userId),
        eq(schema.likes.blogId, blogId)
      ))
      .returning();
    return deleted.length > 0;
  }
  
  async isLikedByUser(userId: number, blogId: number): Promise<boolean> {
    const result = await db.select()
      .from(schema.likes)
      .where(and(
        eq(schema.likes.userId, userId),
        eq(schema.likes.blogId, blogId)
      ))
      .limit(1);
    
    return result.length > 0;
  }
  
  async getLikeCount(blogId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.likes)
      .where(eq(schema.likes.blogId, blogId));
    
    return result[0]?.count || 0;
  }
  
  // Comment methods
  async getComments(blogId: number): Promise<(schema.Comment & { user: schema.User })[]> {
    return await db.query.comments.findMany({
      where: eq(schema.comments.blogId, blogId),
      with: { user: true },
      orderBy: asc(schema.comments.createdAt)
    });
  }
  
  async createComment(comment: Omit<schema.InsertComment, "userId" | "createdAt"> & { userId: number }): Promise<schema.Comment> {
    const [newComment] = await db.insert(schema.comments).values(comment).returning();
    return newComment;
  }
  
  async deleteComment(id: number): Promise<boolean> {
    const deleted = await db.delete(schema.comments).where(eq(schema.comments.id, id)).returning();
    return deleted.length > 0;
  }
  
  // Bookmark methods
  async bookmarkBlog(userId: number, blogId: number): Promise<boolean> {
    try {
      await db.insert(schema.bookmarks).values({ userId, blogId }).returning();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async unbookmarkBlog(userId: number, blogId: number): Promise<boolean> {
    const deleted = await db.delete(schema.bookmarks)
      .where(and(
        eq(schema.bookmarks.userId, userId),
        eq(schema.bookmarks.blogId, blogId)
      ))
      .returning();
    return deleted.length > 0;
  }
  
  async isBookmarkedByUser(userId: number, blogId: number): Promise<boolean> {
    const result = await db.select()
      .from(schema.bookmarks)
      .where(and(
        eq(schema.bookmarks.userId, userId),
        eq(schema.bookmarks.blogId, blogId)
      ))
      .limit(1);
    
    return result.length > 0;
  }
  
  async getBookmarks(userId: number): Promise<(schema.Blog & { author: schema.User })[]> {
    const bookmarks = await db.select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, userId))
      .innerJoin(schema.blogs, eq(schema.bookmarks.blogId, schema.blogs.id))
      .orderBy(desc(schema.bookmarks.createdAt));
      
    const blogs = bookmarks.map(b => b.blogs);
    
    // Fetch authors for each blog
    const blogsWithAuthors = await Promise.all(blogs.map(async (blog) => {
      const author = await this.getUser(blog.authorId);
      return { ...blog, author: author! };
    }));
    
    return blogsWithAuthors;
  }
  
  // Notification methods
  async createNotification(notification: { 
    userId: number, 
    actorId?: number, 
    type: string, 
    blogId?: number, 
    commentId?: number 
  }): Promise<schema.Notification> {
    const [newNotification] = await db.insert(schema.notifications).values(notification).returning();
    return newNotification;
  }
  
  async getNotifications(userId: number, limit = 20, offset = 0): Promise<(schema.Notification & { 
    actor?: schema.User, 
    blog?: schema.Blog 
  })[]> {
    const notifications = await db.query.notifications.findMany({
      where: eq(schema.notifications.userId, userId),
      orderBy: desc(schema.notifications.createdAt),
      limit,
      offset,
      with: {
        actor: true,
        blog: true
      }
    });
    
    return notifications;
  }
  
  async markNotificationAsRead(id: number): Promise<boolean> {
    const [updatedNotification] = await db.update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return !!updatedNotification;
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<boolean> {
    await db.update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.userId, userId))
      .returning();
    return true;
  }
  
  async getUnreadNotificationCount(userId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.read, false)
      ));
    
    return result[0]?.count || 0;
  }
  
  // Message methods
  async getMessages(userId1: number, userId2: number, limit = 50, offset = 0): Promise<schema.Message[]> {
    const messages = await db.select()
      .from(schema.messages)
      .where(or(
        and(
          eq(schema.messages.senderId, userId1),
          eq(schema.messages.receiverId, userId2)
        ),
        and(
          eq(schema.messages.senderId, userId2),
          eq(schema.messages.receiverId, userId1)
        )
      ))
      .orderBy(asc(schema.messages.createdAt))
      .limit(limit)
      .offset(offset);
    
    return messages;
  }
  
  async sendMessage(message: Omit<schema.InsertMessage, "createdAt" | "read">): Promise<schema.Message> {
    const [newMessage] = await db.insert(schema.messages).values(message).returning();
    return newMessage;
  }
  
  async markMessageAsRead(id: number): Promise<boolean> {
    const [updatedMessage] = await db.update(schema.messages)
      .set({ read: true })
      .where(eq(schema.messages.id, id))
      .returning();
    return !!updatedMessage;
  }
  
  async markAllMessagesAsRead(senderId: number, receiverId: number): Promise<boolean> {
    await db.update(schema.messages)
      .set({ read: true })
      .where(and(
        eq(schema.messages.senderId, senderId),
        eq(schema.messages.receiverId, receiverId),
        eq(schema.messages.read, false)
      ))
      .returning();
    return true;
  }
  
  async getConversations(userId: number): Promise<{ user: schema.User, lastMessage: schema.Message, unreadCount: number }[]> {
    // Get unique users this user has chatted with
    const sentToUsers = await db.select({ id: schema.messages.receiverId })
      .from(schema.messages)
      .where(eq(schema.messages.senderId, userId))
      .groupBy(schema.messages.receiverId);
      
    const receivedFromUsers = await db.select({ id: schema.messages.senderId })
      .from(schema.messages)
      .where(eq(schema.messages.receiverId, userId))
      .groupBy(schema.messages.senderId);
      
    // Combine and deduplicate
    const chatUserIds = [...new Set([
      ...sentToUsers.map(u => u.id),
      ...receivedFromUsers.map(u => u.id)
    ])];
    
    // For each user, get the last message and unread count
    const conversations = await Promise.all(chatUserIds.map(async (chatUserId) => {
      const user = await this.getUser(chatUserId);
      
      if (!user) {
        throw new Error(`User with ID ${chatUserId} not found`);
      }
      
      // Get the last message
      const lastMessages = await db.select()
        .from(schema.messages)
        .where(or(
          and(
            eq(schema.messages.senderId, userId),
            eq(schema.messages.receiverId, chatUserId)
          ),
          and(
            eq(schema.messages.senderId, chatUserId),
            eq(schema.messages.receiverId, userId)
          )
        ))
        .orderBy(desc(schema.messages.createdAt))
        .limit(1);
        
      const lastMessage = lastMessages[0];
      
      if (!lastMessage) {
        throw new Error(`No messages found between users ${userId} and ${chatUserId}`);
      }
      
      // Get unread count
      const unreadCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(and(
          eq(schema.messages.senderId, chatUserId),
          eq(schema.messages.receiverId, userId),
          eq(schema.messages.read, false)
        ));
        
      const unreadCount = unreadCountResult[0]?.count || 0;
      
      return { user, lastMessage, unreadCount };
    }));
    
    // Sort by last message time, newest first
    return conversations.sort((a, b) => 
      b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
    );
  }
  
  // Search methods
  async searchUsers(query: string): Promise<schema.User[]> {
    return await db.select()
      .from(schema.users)
      .where(or(
        sql`${schema.users.username} ILIKE ${`%${query}%`}`,
        sql`${schema.users.displayName} ILIKE ${`%${query}%`}`
      ))
      .limit(20);
  }
  
  async searchBlogs(query: string): Promise<(schema.Blog & { author: schema.User })[]> {
    const blogs = await db.select()
      .from(schema.blogs)
      .where(or(
        sql`${schema.blogs.title} ILIKE ${`%${query}%`}`,
        sql`${schema.blogs.content} ILIKE ${`%${query}%`}`
      ))
      .limit(20);
      
    // Fetch authors for each blog
    const blogsWithAuthors = await Promise.all(blogs.map(async (blog) => {
      const author = await this.getUser(blog.authorId);
      return { ...blog, author: author! };
    }));
    
    return blogsWithAuthors;
  }
  
  // Trending methods
  async getTrendingBlogs(limit = 10): Promise<(schema.Blog & { author: schema.User, likeCount: number, commentCount: number })[]> {
    // Get blogs with their like counts
    const blogLikeCounts = await db.select({
      blogId: schema.likes.blogId,
      likeCount: sql<number>`count(*)`
    })
    .from(schema.likes)
    .groupBy(schema.likes.blogId);
    
    // Get blogs with their comment counts
    const blogCommentCounts = await db.select({
      blogId: schema.comments.blogId,
      commentCount: sql<number>`count(*)`
    })
    .from(schema.comments)
    .groupBy(schema.comments.blogId);
    
    // Map of blogId to like count
    const likeCountMap = new Map(blogLikeCounts.map(b => [b.blogId, b.likeCount]));
    
    // Map of blogId to comment count
    const commentCountMap = new Map(blogCommentCounts.map(b => [b.blogId, b.commentCount]));
    
    // Get all blogs with authors
    const allBlogs = await db.query.blogs.findMany({
      with: { author: true },
      orderBy: desc(schema.blogs.createdAt),
      limit: 50 // Fetch more blogs than needed to ensure we have enough with engagement
    });
    
    // Add engagement metrics to each blog
    const blogsWithEngagement = allBlogs.map(blog => ({
      ...blog,
      likeCount: likeCountMap.get(blog.id) || 0,
      commentCount: commentCountMap.get(blog.id) || 0,
      totalEngagement: (likeCountMap.get(blog.id) || 0) + (commentCountMap.get(blog.id) || 0)
    }));
    
    // Sort by total engagement and return the top 'limit' blogs
    return blogsWithEngagement
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, limit);
  }
}

export const storage = new DatabaseStorage();
