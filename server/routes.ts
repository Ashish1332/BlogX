import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { WebSocketServer } from "ws";
import { insertBlogSchema, insertCommentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage for profile images
const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage_config,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.") as any);
    }
  }
});

// Helper function to check if user is authenticated
function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  const httpServer = createServer(app);
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected clients and their user IDs
  const clients = new Map();
  
  wss.on('connection', (ws, req) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // If client sends a userId, associate it with this connection
        if (data.type === 'identity' && data.userId) {
          clients.set(ws, data.userId);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      clients.delete(ws);
    });
  });
  
  // Broadcast a message to all users following a specific user
  async function broadcastToFollowers(userId: number, data: any) {
    const followers = await storage.getFollowers(userId);
    
    clients.forEach((clientUserId, client) => {
      const isFollower = followers.some(follower => follower.id === clientUserId);
      
      if (client.readyState === WebSocket.OPEN && isFollower) {
        client.send(JSON.stringify(data));
      }
    });
  }
  
  // Broadcast a message to a specific user
  function broadcastToUser(userId: number, data: any) {
    clients.forEach((clientUserId, client) => {
      if (client.readyState === WebSocket.OPEN && clientUserId === userId) {
        client.send(JSON.stringify(data));
      }
    });
  }

  // Blog Routes
  app.get("/api/blogs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const blogs = await storage.getBlogs(limit, offset);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(blogs.map(async (blog) => {
        const likeCount = await storage.getLikeCount(blog.id);
        const comments = await storage.getComments(blog.id);
        
        // If user is authenticated, check if they liked or bookmarked the blog
        let isLiked = false;
        let isBookmarked = false;
        
        if (req.isAuthenticated()) {
          isLiked = await storage.isLikedByUser(req.user.id, blog.id);
          isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
        }
        
        return {
          ...blog,
          likeCount,
          commentCount: comments.length,
          isLiked,
          isBookmarked
        };
      }));
      
      res.json(enhancedBlogs);
    } catch (error) {
      console.error("Error fetching blogs:", error);
      res.status(500).json({ message: "Failed to fetch blogs" });
    }
  });
  
  app.get("/api/blogs/feed", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const blogs = await storage.getBlogsByFollowing(req.user.id, limit, offset);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(blogs.map(async (blog) => {
        const likeCount = await storage.getLikeCount(blog.id);
        const comments = await storage.getComments(blog.id);
        const isLiked = await storage.isLikedByUser(req.user.id, blog.id);
        const isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
        
        return {
          ...blog,
          likeCount,
          commentCount: comments.length,
          isLiked,
          isBookmarked
        };
      }));
      
      res.json(enhancedBlogs);
    } catch (error) {
      console.error("Error fetching feed:", error);
      res.status(500).json({ message: "Failed to fetch feed" });
    }
  });
  
  app.get("/api/blogs/trending", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const trendingBlogs = await storage.getTrendingBlogs(limit);
      
      // If user is authenticated, check if they liked or bookmarked the blog
      if (req.isAuthenticated()) {
        const enhancedBlogs = await Promise.all(trendingBlogs.map(async (blog) => {
          const isLiked = await storage.isLikedByUser(req.user.id, blog.id);
          const isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
          
          return {
            ...blog,
            isLiked,
            isBookmarked
          };
        }));
        
        res.json(enhancedBlogs);
      } else {
        res.json(trendingBlogs);
      }
    } catch (error) {
      console.error("Error fetching trending blogs:", error);
      res.status(500).json({ message: "Failed to fetch trending blogs" });
    }
  });
  
  app.get("/api/blogs/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const blogs = await storage.getBlogsByUser(userId, limit, offset);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(blogs.map(async (blog) => {
        const likeCount = await storage.getLikeCount(blog.id);
        const comments = await storage.getComments(blog.id);
        
        // If user is authenticated, check if they liked or bookmarked the blog
        let isLiked = false;
        let isBookmarked = false;
        
        if (req.isAuthenticated()) {
          isLiked = await storage.isLikedByUser(req.user.id, blog.id);
          isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
        }
        
        return {
          ...blog,
          likeCount,
          commentCount: comments.length,
          isLiked,
          isBookmarked
        };
      }));
      
      res.json(enhancedBlogs);
    } catch (error) {
      console.error("Error fetching user blogs:", error);
      res.status(500).json({ message: "Failed to fetch user blogs" });
    }
  });
  
  app.get("/api/blogs/:id", async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const likeCount = await storage.getLikeCount(blog.id);
      const comments = await storage.getComments(blog.id);
      
      // If user is authenticated, check if they liked or bookmarked the blog
      let isLiked = false;
      let isBookmarked = false;
      
      if (req.isAuthenticated()) {
        isLiked = await storage.isLikedByUser(req.user.id, blog.id);
        isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
      }
      
      res.json({
        ...blog,
        likeCount,
        commentCount: comments.length,
        isLiked,
        isBookmarked
      });
    } catch (error) {
      console.error("Error fetching blog:", error);
      res.status(500).json({ message: "Failed to fetch blog" });
    }
  });
  
  app.post("/api/blogs", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertBlogSchema.parse(req.body);
      
      const blog = await storage.createBlog({
        ...validatedData,
        authorId: req.user.id
      });
      
      // Broadcast to followers
      broadcastToFollowers(req.user.id, {
        type: 'new_blog',
        blog,
        user: req.user
      });
      
      res.status(201).json(blog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating blog:", error);
      res.status(500).json({ message: "Failed to create blog" });
    }
  });
  
  app.put("/api/blogs/:id", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      if (blog.authorId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this blog" });
      }
      
      const validatedData = insertBlogSchema.parse(req.body);
      
      const updatedBlog = await storage.updateBlog(blogId, validatedData);
      
      res.json(updatedBlog);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error updating blog:", error);
      res.status(500).json({ message: "Failed to update blog" });
    }
  });
  
  app.delete("/api/blogs/:id", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      if (blog.authorId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this blog" });
      }
      
      await storage.deleteBlog(blogId);
      
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting blog:", error);
      res.status(500).json({ message: "Failed to delete blog" });
    }
  });
  
  // Like Routes
  app.post("/api/blogs/:id/like", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      await storage.likeBlog(req.user.id, blogId);
      
      // Create notification if the user is not liking their own blog
      if (blog.authorId !== req.user.id) {
        await storage.createNotification({
          userId: blog.authorId,
          actorId: req.user.id,
          type: 'like',
          blogId
        });
        
        // Broadcast notification to blog author
        broadcastToUser(blog.authorId, {
          type: 'notification',
          notification: {
            type: 'like',
            actor: req.user,
            blog
          }
        });
      }
      
      const likeCount = await storage.getLikeCount(blogId);
      
      res.json({ success: true, likeCount });
    } catch (error) {
      console.error("Error liking blog:", error);
      res.status(500).json({ message: "Failed to like blog" });
    }
  });
  
  app.delete("/api/blogs/:id/like", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      await storage.unlikeBlog(req.user.id, blogId);
      
      const likeCount = await storage.getLikeCount(blogId);
      
      res.json({ success: true, likeCount });
    } catch (error) {
      console.error("Error unliking blog:", error);
      res.status(500).json({ message: "Failed to unlike blog" });
    }
  });
  
  // Comment Routes
  app.get("/api/blogs/:id/comments", async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const comments = await storage.getComments(blogId);
      
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });
  
  app.post("/api/blogs/:id/comments", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const validatedData = insertCommentSchema.parse(req.body);
      
      const comment = await storage.createComment({
        ...validatedData,
        userId: req.user.id,
        blogId
      });
      
      // Fetch the user for the response
      const commentWithUser = {
        ...comment,
        user: req.user
      };
      
      // Create notification if the user is not commenting on their own blog
      if (blog.authorId !== req.user.id) {
        await storage.createNotification({
          userId: blog.authorId,
          actorId: req.user.id,
          type: 'comment',
          blogId,
          commentId: comment.id
        });
        
        // Broadcast notification to blog author
        broadcastToUser(blog.authorId, {
          type: 'notification',
          notification: {
            type: 'comment',
            actor: req.user,
            blog,
            comment
          }
        });
      }
      
      // Broadcast to all clients viewing this blog
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'new_comment',
            comment: commentWithUser,
            blogId
          }));
        }
      });
      
      res.status(201).json(commentWithUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });
  
  app.delete("/api/comments/:id", isAuthenticated, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      
      // Check if comment exists and belongs to user
      const comments = await storage.getComments(0); // This is inefficient but works for now
      const comment = comments.find(c => c.id === commentId);
      
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this comment" });
      }
      
      await storage.deleteComment(commentId);
      
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });
  
  // Bookmark Routes
  app.post("/api/blogs/:id/bookmark", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      await storage.bookmarkBlog(req.user.id, blogId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error bookmarking blog:", error);
      res.status(500).json({ message: "Failed to bookmark blog" });
    }
  });
  
  app.delete("/api/blogs/:id/bookmark", isAuthenticated, async (req, res) => {
    try {
      const blogId = parseInt(req.params.id);
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      await storage.unbookmarkBlog(req.user.id, blogId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing bookmark:", error);
      res.status(500).json({ message: "Failed to remove bookmark" });
    }
  });
  
  app.get("/api/bookmarks", isAuthenticated, async (req, res) => {
    try {
      const bookmarks = await storage.getBookmarks(req.user.id);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(bookmarks.map(async (blog) => {
        const likeCount = await storage.getLikeCount(blog.id);
        const comments = await storage.getComments(blog.id);
        const isLiked = await storage.isLikedByUser(req.user.id, blog.id);
        
        return {
          ...blog,
          likeCount,
          commentCount: comments.length,
          isLiked,
          isBookmarked: true
        };
      }));
      
      res.json(enhancedBlogs);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      res.status(500).json({ message: "Failed to fetch bookmarks" });
    }
  });
  
  // User Routes
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      // Get follower and following counts
      const followers = await storage.getFollowers(userId);
      const following = await storage.getFollowing(userId);
      
      // Check if current user is following this user
      let isFollowing = false;
      if (req.isAuthenticated()) {
        isFollowing = await storage.isFollowing(req.user.id, userId);
      }
      
      res.json({
        ...userWithoutPassword,
        followerCount: followers.length,
        followingCount: following.length,
        isFollowing
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  
  app.put("/api/users/profile", isAuthenticated, async (req, res) => {
    try {
      const { displayName, bio, profileImage, coverImage } = req.body;
      
      const updatedUser = await storage.updateUser(req.user.id, {
        displayName,
        bio,
        profileImage,
        coverImage
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = updatedUser;
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });
  
  // Follow Routes
  app.post("/api/users/:id/follow", isAuthenticated, async (req, res) => {
    try {
      const followingId = parseInt(req.params.id);
      const userToFollow = await storage.getUser(followingId);
      
      if (!userToFollow) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (followingId === req.user.id) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }
      
      await storage.followUser(req.user.id, followingId);
      
      // Create notification
      await storage.createNotification({
        userId: followingId,
        actorId: req.user.id,
        type: 'follow'
      });
      
      // Broadcast notification to followed user
      broadcastToUser(followingId, {
        type: 'notification',
        notification: {
          type: 'follow',
          actor: req.user
        }
      });
      
      const followers = await storage.getFollowers(followingId);
      
      res.json({ success: true, followerCount: followers.length });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });
  
  app.delete("/api/users/:id/follow", isAuthenticated, async (req, res) => {
    try {
      const followingId = parseInt(req.params.id);
      const userToUnfollow = await storage.getUser(followingId);
      
      if (!userToUnfollow) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.unfollowUser(req.user.id, followingId);
      
      const followers = await storage.getFollowers(followingId);
      
      res.json({ success: true, followerCount: followers.length });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });
  
  app.get("/api/users/:id/followers", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const followers = await storage.getFollowers(userId);
      
      // If user is authenticated, check which followers they are following
      if (req.isAuthenticated()) {
        const enhancedFollowers = await Promise.all(followers.map(async (follower) => {
          const isFollowing = await storage.isFollowing(req.user.id, follower.id);
          return {
            ...follower,
            isFollowing,
            isCurrentUser: follower.id === req.user.id
          };
        }));
        
        res.json(enhancedFollowers);
      } else {
        res.json(followers);
      }
    } catch (error) {
      console.error("Error fetching followers:", error);
      res.status(500).json({ message: "Failed to fetch followers" });
    }
  });
  
  app.get("/api/users/:id/following", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const following = await storage.getFollowing(userId);
      
      // If user is authenticated, check which users they are following
      if (req.isAuthenticated()) {
        const enhancedFollowing = await Promise.all(following.map(async (followedUser) => {
          const isFollowing = await storage.isFollowing(req.user.id, followedUser.id);
          return {
            ...followedUser,
            isFollowing,
            isCurrentUser: followedUser.id === req.user.id
          };
        }));
        
        res.json(enhancedFollowing);
      } else {
        res.json(following);
      }
    } catch (error) {
      console.error("Error fetching following:", error);
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });
  
  // Search Routes
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 1) {
        return res.status(400).json({ message: "Query parameter is required" });
      }
      
      const users = await storage.searchUsers(query);
      const blogs = await storage.searchBlogs(query);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(blogs.map(async (blog) => {
        const likeCount = await storage.getLikeCount(blog.id);
        const comments = await storage.getComments(blog.id);
        
        // If user is authenticated, check if they liked or bookmarked the blog
        let isLiked = false;
        let isBookmarked = false;
        
        if (req.isAuthenticated()) {
          isLiked = await storage.isLikedByUser(req.user.id, blog.id);
          isBookmarked = await storage.isBookmarkedByUser(req.user.id, blog.id);
        }
        
        return {
          ...blog,
          likeCount,
          commentCount: comments.length,
          isLiked,
          isBookmarked
        };
      }));
      
      res.json({
        users,
        blogs: enhancedBlogs
      });
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ message: "Failed to perform search" });
    }
  });
  
  // Notification Routes
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const notifications = await storage.getNotifications(req.user.id, limit, offset);
      
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  
  app.get("/api/notifications/unread/count", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user.id);
      
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ message: "Failed to fetch unread notification count" });
    }
  });
  
  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      
      await storage.markNotificationAsRead(notificationId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });
  
  app.post("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.user.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });
  
  // Message Routes
  app.get("/api/messages/conversations", isAuthenticated, async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.user.id);
      
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });
  
  app.get("/api/messages/:userId", isAuthenticated, async (req, res) => {
    try {
      const otherUserId = parseInt(req.params.userId);
      const otherUser = await storage.getUser(otherUserId);
      
      if (!otherUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const messages = await storage.getMessages(req.user.id, otherUserId);
      
      // Mark messages from other user as read
      for (const message of messages) {
        if (message.senderId === otherUserId && !message.read) {
          await storage.markMessageAsRead(message.id);
        }
      }
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  
  app.post("/api/messages/:userId", isAuthenticated, async (req, res) => {
    try {
      const receiverId = parseInt(req.params.userId);
      const receiver = await storage.getUser(receiverId);
      
      if (!receiver) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const validatedData = insertMessageSchema.parse(req.body);
      
      const message = await storage.sendMessage({
        senderId: req.user.id,
        receiverId,
        content: validatedData.content
      });
      
      // Broadcast message to receiver
      broadcastToUser(receiverId, {
        type: 'new_message',
        message,
        sender: req.user
      });
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });
  
  return httpServer;
}
