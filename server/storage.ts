import { db, User, Blog, Comment, Like, Bookmark, Follower, Notification, Message } from "@db";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";

export interface IStorage {
  // User methods
  getUser: (id: string) => Promise<any | undefined>;
  getUserByUsername: (username: string) => Promise<any | undefined>;
  createUser: (user: any) => Promise<any>;
  updateUser: (id: string, userData: any) => Promise<any | undefined>;
  
  // Blog methods
  getBlogs: (limit?: number, offset?: number) => Promise<any[]>;
  getBlogsByUser: (userId: string, limit?: number, offset?: number) => Promise<any[]>;
  getBlogsByFollowing: (userId: string, limit?: number, offset?: number) => Promise<any[]>;
  getBlog: (id: string) => Promise<any | undefined>;
  createBlog: (blog: any & { authorId: string }) => Promise<any>;
  updateBlog: (id: string, blogData: any) => Promise<any | undefined>;
  deleteBlog: (id: string) => Promise<boolean>;
  
  // Follower methods
  followUser: (followerId: string, followingId: string) => Promise<boolean>;
  unfollowUser: (followerId: string, followingId: string) => Promise<boolean>;
  getFollowers: (userId: string) => Promise<any[]>;
  getFollowing: (userId: string) => Promise<any[]>;
  isFollowing: (followerId: string, followingId: string) => Promise<boolean>;
  
  // Like methods
  likeBlog: (userId: string, blogId: string) => Promise<boolean>;
  unlikeBlog: (userId: string, blogId: string) => Promise<boolean>;
  isLikedByUser: (userId: string, blogId: string) => Promise<boolean>;
  getLikeCount: (blogId: string) => Promise<number>;
  
  // Comment methods
  getComments: (blogId: string) => Promise<any[]>;
  createComment: (comment: any & { userId: string }) => Promise<any>;
  deleteComment: (id: string) => Promise<boolean>;
  
  // Bookmark methods
  bookmarkBlog: (userId: string, blogId: string) => Promise<boolean>;
  unbookmarkBlog: (userId: string, blogId: string) => Promise<boolean>;
  isBookmarkedByUser: (userId: string, blogId: string) => Promise<boolean>;
  getBookmarks: (userId: string) => Promise<any[]>;
  
  // Notification methods
  createNotification: (notification: { 
    userId: string, 
    actorId?: string, 
    type: string, 
    blogId?: string, 
    commentId?: string 
  }) => Promise<any>;
  getNotifications: (userId: string, limit?: number, offset?: number) => Promise<any[]>;
  markNotificationAsRead: (id: string) => Promise<boolean>;
  markAllNotificationsAsRead: (userId: string) => Promise<boolean>;
  getUnreadNotificationCount: (userId: string) => Promise<number>;
  
  // Message methods
  getMessages: (userId1: string, userId2: string, limit?: number, offset?: number) => Promise<any[]>;
  getMessageById: (messageId: string) => Promise<any | null>;
  sendMessage: (message: any) => Promise<any>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  markMessageAsRead: (id: string) => Promise<boolean>;
  markAllMessagesAsRead: (senderId: string, receiverId: string) => Promise<boolean>;
  getConversations: (userId: string) => Promise<any[]>;
  
  // Search methods
  searchUsers: (query: string) => Promise<any[]>;
  searchBlogs: (query: string) => Promise<any[]>;
  
  // Trending methods
  getTrendingBlogs: (limit?: number) => Promise<any[]>;
  
  // Session store for authentication
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is required for session store");
    }
    
    this.sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions'
    });
  }
  
  // User methods
  async getUser(id: string): Promise<any | undefined> {
    try {
      // If id is not a valid MongoDB ObjectId format, return undefined
      // This prevents casting errors when id is undefined or invalid
      if (!id || id === "-1" || id === "undefined" || id.length !== 24) {
        return undefined;
      }
      
      const user = await User.findById(id);
      return user?.toObject();
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  }
  
  async getUserByUsername(username: string): Promise<any | undefined> {
    try {
      const user = await User.findOne({ username });
      return user?.toObject();
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  }
  
  async createUser(user: any): Promise<any> {
    try {
      const newUser = new User(user);
      await newUser.save();
      return newUser.toObject();
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }
  
  async updateUser(id: string, userData: any): Promise<any | undefined> {
    try {
      // Log the incoming data
      console.log("updateUser called with id:", id, "and userData:", userData);

      // If id is not provided, return undefined
      if (!id) {
        console.error("updateUser: No id provided");
        return undefined;
      }
      
      // Explicitly check for MongoDB ObjectID format
      if (id === "-1" || id === "undefined" || id.length !== 24) {
        console.error("updateUser: Invalid ObjectID format:", id);
        return undefined;
      }
      
      // First, fetch the user to make sure they exist
      const existingUser = await User.findById(id);
      if (!existingUser) {
        console.error("updateUser: No user found with ID:", id);
        return undefined;
      }
      
      console.log("updateUser: Found existing user:", existingUser);
      
      // Create a copy of userData with only the fields we want to update
      const sanitizedUserData: any = {};
      
      if (userData.displayName !== undefined) sanitizedUserData.displayName = userData.displayName;
      if (userData.bio !== undefined) sanitizedUserData.bio = userData.bio;
      if (userData.profileImage !== undefined) sanitizedUserData.profileImage = userData.profileImage;
      if (userData.coverImage !== undefined) sanitizedUserData.coverImage = userData.coverImage;
      
      console.log("updateUser: Sanitized userData:", sanitizedUserData);
      
      // Update the user
      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: sanitizedUserData },
        { new: true }
      );
      
      if (!updatedUser) {
        console.error("updateUser: Update failed for user with ID:", id);
        return undefined;
      }
      
      console.log("updateUser: Update successful, returning:", updatedUser);
      return updatedUser.toObject();
    } catch (error) {
      console.error("Error updating user:", error);
      return undefined;
    }
  }
  
  // Blog methods
  async getBlogs(limit = 10, offset = 0): Promise<any[]> {
    try {
      const blogs = await Blog.find()
        .populate('author')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
      return blogs.map(blog => blog.toObject());
    } catch (error) {
      console.error("Error getting blogs:", error);
      return [];
    }
  }
  
  async getBlogsByUser(userId: string, limit = 10, offset = 0): Promise<any[]> {
    try {
      // If userId is not a valid MongoDB ObjectId format, return empty array
      // This prevents casting errors when userId is undefined or invalid
      if (!userId || userId === "-1" || userId === "undefined" || userId.length !== 24) {
        return [];
      }
      
      const blogs = await Blog.find({ author: userId })
        .populate('author')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
      return blogs.map(blog => blog.toObject());
    } catch (error) {
      console.error("Error getting blogs by user:", error);
      return [];
    }
  }
  
  async getBlogsByFollowing(userId: string, limit = 10, offset = 0): Promise<any[]> {
    try {
      const following = await Follower.find({ follower: userId });
      const followingIds = following.map(f => f.following);
      
      if (followingIds.length === 0) {
        return [];
      }
      
      const blogs = await Blog.find({ author: { $in: followingIds } })
        .populate('author')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
      
      return blogs.map(blog => blog.toObject());
    } catch (error) {
      console.error("Error getting blogs by following:", error);
      return [];
    }
  }
  
  async getBlog(id: string): Promise<any | undefined> {
    try {
      // If id is not a valid MongoDB ObjectId format, return undefined
      // This prevents casting errors when id is undefined or invalid
      if (!id || id === "-1" || id === "undefined" || id.length !== 24) {
        return undefined;
      }
      
      const blog = await Blog.findById(id).populate('author');
      return blog?.toObject();
    } catch (error) {
      console.error("Error getting blog:", error);
      return undefined;
    }
  }
  
  async createBlog(blog: any & { authorId: string }): Promise<any> {
    try {
      const newBlog = new Blog({
        title: blog.title,
        content: blog.content,
        image: blog.image,
        author: blog.authorId
      });
      await newBlog.save();
      const populatedBlog = await Blog.findById(newBlog._id).populate('author');
      return populatedBlog?.toObject();
    } catch (error) {
      console.error("Error creating blog:", error);
      throw error;
    }
  }
  
  async updateBlog(id: string, blogData: any): Promise<any | undefined> {
    try {
      blogData.updatedAt = new Date();
      const updatedBlog = await Blog.findByIdAndUpdate(
        id,
        { $set: blogData },
        { new: true }
      ).populate('author');
      return updatedBlog?.toObject();
    } catch (error) {
      console.error("Error updating blog:", error);
      return undefined;
    }
  }
  
  async deleteBlog(id: string): Promise<boolean> {
    try {
      const result = await Blog.deleteOne({ _id: id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error deleting blog:", error);
      return false;
    }
  }
  
  // Follower methods
  async followUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      console.log("followUser called with:", {
        followerId,
        followingId,
        followerIdType: typeof followerId,
        followingIdType: typeof followingId
      });
      
      // Check if the IDs are valid MongoDB ObjectId format
      if (!followerId || !followingId || 
          followerId === "-1" || followingId === "-1" || 
          followerId === "undefined" || followingId === "undefined" ||
          followerId.length !== 24 || followingId.length !== 24) {
        console.error("Invalid user IDs for following:", { followerId, followingId });
        return false;
      }
      
      // Check if both users exist
      const followerUser = await User.findById(followerId);
      const followingUser = await User.findById(followingId);
      
      if (!followerUser) {
        console.error("Follower user not found:", followerId);
        return false;
      }
      
      if (!followingUser) {
        console.error("Following user not found:", followingId);
        return false;
      }
      
      console.log("Both users exist:", {
        follower: followerUser._id.toString(),
        following: followingUser._id.toString()
      });
      
      const existingFollow = await Follower.findOne({
        follower: followerId,
        following: followingId
      });
      
      if (existingFollow) {
        console.log("Already following");
        return true; // Already following
      }
      
      console.log("Creating new follow");
      const newFollow = new Follower({
        follower: followerId,
        following: followingId
      });
      
      const savedFollow = await newFollow.save();
      console.log("Follow saved:", savedFollow);
      return true;
    } catch (error) {
      console.error("Error following user:", error);
      return false;
    }
  }
  
  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      console.log("unfollowUser called with:", {
        followerId,
        followingId,
        followerIdType: typeof followerId,
        followingIdType: typeof followingId
      });
      
      // Check if the IDs are valid MongoDB ObjectId format
      if (!followerId || !followingId || 
          followerId === "-1" || followingId === "-1" || 
          followerId === "undefined" || followingId === "undefined" ||
          followerId.length !== 24 || followingId.length !== 24) {
        console.error("Invalid user IDs for unfollowing:", { followerId, followingId });
        return false;
      }
      
      // Check if both users exist
      const followerUser = await User.findById(followerId);
      const followingUser = await User.findById(followingId);
      
      if (!followerUser) {
        console.error("Follower user not found:", followerId);
        return false;
      }
      
      if (!followingUser) {
        console.error("Following user not found:", followingId);
        return false;
      }
      
      console.log("Both users exist for unfollow:", {
        follower: followerUser._id.toString(),
        following: followingUser._id.toString()
      });
      
      // First check if the follow relationship exists
      const existingFollow = await Follower.findOne({
        follower: followerId,
        following: followingId
      });
      
      if (!existingFollow) {
        console.log("Follow relationship does not exist, nothing to unfollow");
        return false;
      }
      
      console.log("Found existing follow relationship:", existingFollow);
      
      const result = await Follower.deleteOne({
        follower: followerId,
        following: followingId
      });
      
      console.log("Unfollow result:", {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
      });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error unfollowing user:", error);
      return false;
    }
  }
  
  async getFollowers(userId: string): Promise<any[]> {
    try {
      const followers = await Follower.find({ following: userId }).populate('follower');
      return followers.map(f => f.follower.toObject());
    } catch (error) {
      console.error("Error getting followers:", error);
      return [];
    }
  }
  
  async getFollowing(userId: string): Promise<any[]> {
    try {
      const following = await Follower.find({ follower: userId }).populate('following');
      return following.map(f => f.following.toObject());
    } catch (error) {
      console.error("Error getting following:", error);
      return [];
    }
  }
  
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      console.log("isFollowing check:", {
        followerId,
        followingId,
        followerIdType: typeof followerId,
        followingIdType: typeof followingId
      });
      
      // Check if the IDs are valid MongoDB ObjectId format
      if (!followerId || !followingId || 
          followerId === "-1" || followingId === "-1" || 
          followerId === "undefined" || followingId === "undefined" ||
          followerId.length !== 24 || followingId.length !== 24) {
        console.error("Invalid user IDs for isFollowing check:", { followerId, followingId });
        return false;
      }
      
      const follow = await Follower.findOne({
        follower: followerId,
        following: followingId
      });
      
      console.log("isFollowing result:", !!follow);
      return !!follow;
    } catch (error) {
      console.error("Error checking if following:", error);
      return false;
    }
  }
  
  // Like methods
  async likeBlog(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("likeBlog called with:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for liking:", { userId, blogId });
        return false;
      }
      
      const existingLike = await Like.findOne({
        user: userId,
        blog: blogId
      });
      
      if (existingLike) {
        console.log("Blog already liked:", existingLike);
        return true; // Already liked
      }
      
      const newLike = new Like({
        user: userId,
        blog: blogId
      });
      
      const savedLike = await newLike.save();
      console.log("New like saved:", savedLike);
      return true;
    } catch (error) {
      console.error("Error liking blog:", error);
      return false;
    }
  }
  
  async unlikeBlog(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("unlikeBlog called with:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for unliking:", { userId, blogId });
        return false;
      }
      
      // Check if the like exists before deleting
      const existingLike = await Like.findOne({
        user: userId,
        blog: blogId
      });
      
      if (!existingLike) {
        console.log("No like found to unlike:", { userId, blogId });
        return false; // Nothing to unlike
      }
      
      const result = await Like.deleteOne({
        user: userId,
        blog: blogId
      });
      
      console.log("Unlike result:", {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
      });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error unliking blog:", error);
      return false;
    }
  }
  
  async isLikedByUser(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("isLikedByUser check:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for like check:", { userId, blogId });
        return false;
      }
      
      const like = await Like.findOne({
        user: userId,
        blog: blogId
      });
      
      console.log("isLikedByUser result:", { 
        liked: !!like, 
        likeData: like 
      });
      
      return !!like;
    } catch (error) {
      console.error("Error checking if blog is liked by user:", error);
      return false;
    }
  }
  
  async getLikeCount(blogId: string): Promise<number> {
    try {
      return await Like.countDocuments({ blog: blogId });
    } catch (error) {
      console.error("Error getting like count:", error);
      return 0;
    }
  }
  
  // Comment methods
  async getComments(blogId: string | number): Promise<any[]> {
    try {
      console.log(`Fetching comments for blog ID: ${blogId}`);
      
      // Handle case where blogId is 0 (used for fetching all comments)
      if (blogId === 0 || blogId === "0") {
        console.log("Fetching all comments (blogId=0)");
        const comments = await Comment.find()
          .populate('user')
          .sort({ createdAt: -1 });
          
        console.log(`Found ${comments.length} total comments`);
        return comments.map(comment => comment.toObject());
      }
      
      // Validate the blog ID format for MongoDB
      if (typeof blogId === 'string' && blogId.length !== 24) {
        console.error(`Invalid blog ID format for getComments: ${blogId}`);
        return [];
      }
      
      const comments = await Comment.find({ blog: blogId })
        .populate('user')
        .sort({ createdAt: 1 });
        
      console.log(`Found ${comments.length} comments for blog ${blogId}`);
      
      // Add some debug info for a few comments
      if (comments.length > 0) {
        console.log("Sample comments:", comments.slice(0, 2).map(c => ({
          id: c._id?.toString(),
          userId: c.user?._id?.toString() || c.userId?.toString(),
          content: c.content.substring(0, 30) + (c.content.length > 30 ? '...' : '')
        })));
      }
      
      return comments.map(comment => comment.toObject());
    } catch (error) {
      console.error("Error getting comments:", error);
      return [];
    }
  }
  
  async createComment(comment: any & { userId: string }): Promise<any> {
    try {
      const newComment = new Comment({
        content: comment.content,
        user: comment.userId,
        blog: comment.blogId
      });
      await newComment.save();
      const populatedComment = await Comment.findById(newComment._id).populate('user');
      return populatedComment?.toObject();
    } catch (error) {
      console.error("Error creating comment:", error);
      throw error;
    }
  }
  
  async deleteComment(id: string): Promise<boolean> {
    try {
      console.log(`Attempting to delete comment with ID: ${id}`);
      
      // Validate the ID format
      if (!id || id.length !== 24) {
        console.error(`Invalid comment ID format: ${id}`);
        return false;
      }
      
      // First check if the comment exists
      const comment = await Comment.findById(id);
      if (!comment) {
        console.log(`No comment found with ID: ${id}`);
        return false;
      }
      
      console.log(`Found comment to delete:`, {
        id,
        userId: comment.user,
        blogId: comment.blog,
        content: comment.content.substring(0, 30) + (comment.content.length > 30 ? '...' : '')
      });
      
      const result = await Comment.deleteOne({ _id: id });
      
      console.log(`Delete comment result:`, {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
      });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }
  
  // Bookmark methods
  async bookmarkBlog(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("bookmarkBlog called with:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for bookmarking:", { userId, blogId });
        return false;
      }
      
      const existingBookmark = await Bookmark.findOne({
        user: userId,
        blog: blogId
      });
      
      if (existingBookmark) {
        console.log("Blog already bookmarked:", existingBookmark);
        return true; // Already bookmarked
      }
      
      const newBookmark = new Bookmark({
        user: userId,
        blog: blogId
      });
      
      const savedBookmark = await newBookmark.save();
      console.log("New bookmark saved:", savedBookmark);
      
      return true;
    } catch (error) {
      console.error("Error bookmarking blog:", error);
      return false;
    }
  }
  
  async unbookmarkBlog(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("unbookmarkBlog called with:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for unbookmarking:", { userId, blogId });
        return false;
      }
      
      // Check if the bookmark exists before deleting
      const existingBookmark = await Bookmark.findOne({
        user: userId,
        blog: blogId
      });
      
      if (!existingBookmark) {
        console.log("No bookmark found to remove:", { userId, blogId });
        return false; // Nothing to remove
      }
      
      const result = await Bookmark.deleteOne({
        user: userId,
        blog: blogId
      });
      
      console.log("Unbookmark result:", {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
      });
      
      return result.deletedCount > 0;
    } catch (error) {
      console.error("Error unbookmarking blog:", error);
      return false;
    }
  }
  
  async isBookmarkedByUser(userId: string, blogId: string): Promise<boolean> {
    try {
      console.log("isBookmarkedByUser check:", { userId, blogId });
      
      // Validate IDs before proceeding
      if (!userId || !blogId || userId.length !== 24 || blogId.length !== 24) {
        console.error("Invalid user or blog ID provided for bookmark check:", { userId, blogId });
        return false;
      }
      
      const bookmark = await Bookmark.findOne({
        user: userId,
        blog: blogId
      });
      
      console.log("isBookmarkedByUser result:", { 
        bookmarked: !!bookmark, 
        bookmarkData: bookmark 
      });
      
      return !!bookmark;
    } catch (error) {
      console.error("Error checking if blog is bookmarked by user:", error);
      return false;
    }
  }
  
  async getBookmarks(userId: string): Promise<any[]> {
    try {
      const bookmarks = await Bookmark.find({ user: userId })
        .populate({
          path: 'blog',
          populate: {
            path: 'author'
          }
        })
        .sort({ createdAt: -1 });
      
      return bookmarks.map(bookmark => bookmark.blog.toObject());
    } catch (error) {
      console.error("Error getting bookmarks:", error);
      return [];
    }
  }
  
  // Notification methods
  async createNotification(notification: { 
    userId: string, 
    actorId?: string, 
    type: string, 
    blogId?: string, 
    commentId?: string 
  }): Promise<any> {
    try {
      const newNotification = new Notification({
        user: notification.userId,
        actor: notification.actorId,
        type: notification.type,
        blog: notification.blogId,
        comment: notification.commentId,
        read: false
      });
      
      await newNotification.save();
      const populatedNotification = await Notification.findById(newNotification._id)
        .populate('actor')
        .populate('blog');
        
      return populatedNotification?.toObject();
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }
  
  async getNotifications(userId: string, limit = 20, offset = 0): Promise<any[]> {
    try {
      const notifications = await Notification.find({ user: userId })
        .populate('actor')
        .populate('blog')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
        
      return notifications.map(notification => notification.toObject());
    } catch (error) {
      console.error("Error getting notifications:", error);
      return [];
    }
  }
  
  async markNotificationAsRead(id: string): Promise<boolean> {
    try {
      const result = await Notification.updateOne(
        { _id: id },
        { $set: { read: true } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }
  }
  
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    try {
      const result = await Notification.updateMany(
        { user: userId, read: false },
        { $set: { read: true } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      return await Notification.countDocuments({ user: userId, read: false });
    } catch (error) {
      console.error("Error getting unread notification count:", error);
      return 0;
    }
  }
  
  // Message methods
  async getMessages(userId1: string, userId2: string, limit = 50, offset = 0): Promise<any[]> {
    try {
      const messages = await Message.find({
        $or: [
          { sender: userId1, receiver: userId2 },
          { sender: userId2, receiver: userId1 }
        ]
      })
      .sort({ createdAt: 1 })
      .skip(offset)
      .limit(limit);
      
      return messages.map(message => message.toObject());
    } catch (error) {
      console.error("Error getting messages:", error);
      return [];
    }
  }
  
  async sendMessage(message: any): Promise<any> {
    try {
      const newMessage = new Message({
        sender: message.senderId,
        receiver: message.receiverId,
        content: message.content,
        read: false
      });
      
      await newMessage.save();
      return newMessage.toObject();
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }
  
  async markMessageAsRead(id: string): Promise<boolean> {
    try {
      const result = await Message.updateOne(
        { _id: id },
        { $set: { read: true } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error marking message as read:", error);
      return false;
    }
  }
  
  async markAllMessagesAsRead(senderId: string, receiverId: string): Promise<boolean> {
    try {
      const result = await Message.updateMany(
        { sender: senderId, receiver: receiverId, read: false },
        { $set: { read: true } }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error marking all messages as read:", error);
      return false;
    }
  }
  
  async getMessageById(messageId: string): Promise<any | null> {
    try {
      const message = await Message.findById(messageId).lean();
      return message;
    } catch (error) {
      console.error("Error getting message by ID:", error);
      return null;
    }
  }
  
  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const result = await Message.findByIdAndDelete(messageId);
      return !!result;
    } catch (error) {
      console.error("Error deleting message:", error);
      return false;
    }
  }
  
  async getConversations(userId: string): Promise<any[]> {
    try {
      // Find all unique users this user has chatted with
      const sentMessages = await Message.aggregate([
        { $match: { sender: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$receiver" } }
      ]);
      
      const receivedMessages = await Message.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$sender" } }
      ]);
      
      // Combine unique user IDs
      const userIds = [
        ...sentMessages.map(m => m._id),
        ...receivedMessages.map(m => m._id)
      ].filter((id, index, self) => 
        self.findIndex(i => i.toString() === id.toString()) === index
      );
      
      // For each user, get the latest message and unread count
      const conversations = await Promise.all(userIds.map(async (otherUserId) => {
        const lastMessage = await Message.findOne({
          $or: [
            { sender: userId, receiver: otherUserId },
            { sender: otherUserId, receiver: userId }
          ]
        }).sort({ createdAt: -1 });
        
        const unreadCount = await Message.countDocuments({
          sender: otherUserId,
          receiver: userId,
          read: false
        });
        
        const user = await User.findById(otherUserId);
        
        return {
          user: user?.toObject(),
          lastMessage: lastMessage?.toObject(),
          unreadCount
        };
      }));
      
      // Sort by latest message time
      return conversations.sort((a, b) => {
        const dateA = a.lastMessage?.createdAt || new Date(0);
        const dateB = b.lastMessage?.createdAt || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
    } catch (error) {
      console.error("Error getting conversations:", error);
      return [];
    }
  }
  
  // Search methods
  async searchUsers(query: string): Promise<any[]> {
    try {
      const users = await User.find({
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { displayName: { $regex: query, $options: 'i' } }
        ]
      }).limit(20);
      
      return users.map(user => user.toObject());
    } catch (error) {
      console.error("Error searching users:", error);
      return [];
    }
  }
  
  async searchBlogs(query: string): Promise<any[]> {
    try {
      const blogs = await Blog.find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } }
        ]
      })
      .populate('author')
      .limit(20);
      
      return blogs.map(blog => blog.toObject());
    } catch (error) {
      console.error("Error searching blogs:", error);
      return [];
    }
  }
  
  // Trending methods
  async getTrendingBlogs(limit = 10): Promise<any[]> {
    try {
      // Get like counts for each blog
      const likeAggregation = await Like.aggregate([
        { $group: { _id: "$blog", count: { $sum: 1 } } }
      ]);
      
      // Get comment counts for each blog
      const commentAggregation = await Comment.aggregate([
        { $group: { _id: "$blog", count: { $sum: 1 } } }
      ]);
      
      // Create a map of blog IDs to like counts
      const likeCounts = new Map();
      likeAggregation.forEach(item => {
        likeCounts.set(item._id.toString(), item.count);
      });
      
      // Create a map of blog IDs to comment counts
      const commentCounts = new Map();
      commentAggregation.forEach(item => {
        commentCounts.set(item._id.toString(), item.count);
      });
      
      // Get all blogs
      const blogs = await Blog.find()
        .populate('author')
        .sort({ createdAt: -1 })
        .limit(100); // Get a pool of recent blogs
      
      // Add metrics to each blog
      const blogsWithMetrics = blogs.map(blog => {
        const blogObj = blog.toObject();
        const blogId = blog._id.toString();
        blogObj.likeCount = likeCounts.get(blogId) || 0;
        blogObj.commentCount = commentCounts.get(blogId) || 0;
        // Simple trending score: likes + comments * 2
        blogObj.trendingScore = blogObj.likeCount + (blogObj.commentCount * 2);
        return blogObj;
      });
      
      // Sort by trending score and return top 'limit' blogs
      return blogsWithMetrics
        .sort((a, b) => b.trendingScore - a.trendingScore)
        .slice(0, limit);
    } catch (error) {
      console.error("Error getting trending blogs:", error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();