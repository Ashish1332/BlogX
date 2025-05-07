import express, { type Express, type Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { insertBlogSchema, insertCommentSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("[INIT] Created uploads directory:", uploadsDir);
}

// Set proper permissions on the uploads directory
try {
  fs.chmodSync(uploadsDir, 0o777); // Full read, write, execute for everyone
  console.log("[INIT] Set permissions on uploads directory:", uploadsDir);
} catch (err) {
  console.error("[INIT] Error setting permissions on uploads directory:", err);
}

// Configure storage for file uploads
const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    // Double-check that the directory exists at time of upload
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log("[UPLOAD] Created uploads directory on-demand:", uploadsDir);
    }
    console.log("[UPLOAD] Destination called for file:", file.originalname);
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Get original file extension or default to .bin if none
    const ext = path.extname(file.originalname) || '.bin';
    const finalFilename = file.fieldname + '-' + uniqueSuffix + ext;
    console.log("[UPLOAD] Generated filename:", finalFilename, "for original:", file.originalname);
    cb(null, finalFilename);
  }
});

// Create a simple storage handler that logs all operations
const upload = multer({ 
  storage: storage_config,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log("[UPLOAD] File filter called for:", file.originalname, "mimetype:", file.mimetype);
    
    // Accept all images for now to debug the upload process
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      console.log("[UPLOAD] File accepted:", file.originalname);
      cb(null, true);
    } else {
      console.log("[UPLOAD] File rejected:", file.originalname, "mimetype not allowed:", file.mimetype);
      cb(null, false);
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
  
  // Track online users and their last active time
  const onlineUsers = new Map<string, { lastActive: Date }>();
  
  // Helper to check if a user is online
  function isUserOnline(userId: string): boolean {
    return clients.has(userId) || onlineUsers.has(userId);
  }
  
  // Update user's active status
  function updateUserActiveStatus(userId: string) {
    onlineUsers.set(userId, { lastActive: new Date() });
  }
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message received:', data);
        
        // If client sends a userId, associate it with this connection
        if (data.type === 'identity' && data.userId) {
          clients.set(ws, data.userId);
          console.log(`Client identified as user: ${data.userId}`);
          updateUserActiveStatus(data.userId);
        }
        
        // Handle direct messages between users
        if (data.type === 'direct_message' && data.to && data.content && data.from) {
          console.log(`Direct message from ${data.from} to ${data.to}`);
          
          try {
            // Verify users exist
            const sender = await storage.getUser(data.from);
            const receiver = await storage.getUser(data.to);
            
            if (!sender || !receiver) {
              console.error(`Invalid users in message: sender=${data.from}, receiver=${data.to}`);
              return;
            }
            
            console.log(`Verified sender: ${sender.username}, receiver: ${receiver.username}`);
            
            // Save message to database
            const savedMessage = await storage.sendMessage({
              senderId: data.from,
              receiverId: data.to,
              content: data.content
            });
            
            console.log(`WebSocket message saved with ID: ${savedMessage._id}`);
            
            // Forward message to recipient
            broadcastToUser(data.to, {
              type: 'new_message',
              message: savedMessage,
              sender: sender
            });
            
            // Also broadcast to the sender to update their UI immediately
            // This avoids needing a separate refetch
            broadcastToUser(data.from, {
              type: 'new_message',
              message: savedMessage,
              isSender: true  // Flag to identify that user is sender
            });
            
            // Send confirmation to sender
            ws.send(JSON.stringify({
              type: 'message_sent',
              messageId: savedMessage._id,
              timestamp: new Date(),
              status: 'delivered'
            }));
          } catch (err) {
            console.error('Error handling direct message:', err);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to deliver message',
              timestamp: new Date()
            }));
          }
        }
        
        // Handle typing indicators
        if (data.type === 'typing' && data.to && data.from) {
          broadcastToUser(data.to, {
            type: 'typing_indicator',
            from: data.from,
            isTyping: data.isTyping
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    // Send a welcome message to the client
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to BlogX realtime server',
      timestamp: new Date()
    }));
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clients.delete(ws);
    });
    
    // Ping clients periodically to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  });
  
  // Broadcast a message to all users following a specific user
  async function broadcastToFollowers(userId: string, data: any) {
    try {
      const followers = await storage.getFollowers(userId);
      console.log(`Broadcasting to ${followers.length} followers of user ${userId}`);
      
      let broadcasted = 0;
      clients.forEach((clientUserId, client) => {
        // Check if this client is a follower (using MongoDB _id)
        const isFollower = followers.some(follower => {
          const followerId = follower._id ? follower._id.toString() : '';
          return followerId === clientUserId;
        });
        
        if (client.readyState === WebSocket.OPEN && isFollower) {
          client.send(JSON.stringify(data));
          broadcasted++;
        }
      });
      
      console.log(`Successfully broadcast to ${broadcasted} online followers`);
    } catch (err) {
      console.error('Error broadcasting to followers:', err);
    }
  }
  
  // Broadcast a message to a specific user
  function broadcastToUser(userId: string, data: any) {
    let sent = false;
    clients.forEach((clientUserId, client) => {
      if (client.readyState === WebSocket.OPEN && clientUserId === userId) {
        client.send(JSON.stringify(data));
        sent = true;
      }
    });
    console.log(`Broadcast to user ${userId}: ${sent ? 'Sent' : 'User not online'}`);
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
      const userId = req.params.userId;
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
      const blogId = req.params.id;
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
      console.log("Creating blog with authenticated user:", req.user);
      const validatedData = insertBlogSchema.parse(req.body);
      
      const blog = await storage.createBlog({
        ...validatedData,
        authorId: req.user._id.toString() // Use _id instead of id for MongoDB
      });
      
      // Broadcast to followers using MongoDB _id
      const currentUserId = req.user?._id?.toString();
      if (currentUserId) {
        console.log(`Broadcasting new blog to followers of user ${currentUserId}`);
        broadcastToFollowers(currentUserId, {
          type: 'new_blog',
          blog,
          user: req.user
        });
      }
      
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
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      // Compare with author's MongoDB _id
      const authorId = blog.author?._id?.toString();
      const currentUserId = req.user._id.toString();
      
      if (authorId !== currentUserId) {
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
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      // Compare with author's MongoDB _id
      const authorId = blog.author?._id?.toString();
      const currentUserId = req.user._id.toString();
      
      if (authorId !== currentUserId) {
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
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const currentUserId = req.user._id.toString();
      await storage.likeBlog(currentUserId, blogId);
      
      // Create notification if the user is not liking their own blog
      const authorId = blog.author?._id?.toString();
      if (authorId !== currentUserId) {
        await storage.createNotification({
          userId: authorId,
          actorId: currentUserId,
          type: 'like',
          blogId
        });
        
        // Broadcast notification to blog author
        broadcastToUser(authorId, {
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
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const currentUserId = req.user._id.toString();
      await storage.unlikeBlog(currentUserId, blogId);
      
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
      const blogId = req.params.id;
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
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const currentUserId = req.user._id.toString();
      await storage.bookmarkBlog(currentUserId, blogId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error bookmarking blog:", error);
      res.status(500).json({ message: "Failed to bookmark blog" });
    }
  });
  
  app.delete("/api/blogs/:id/bookmark", isAuthenticated, async (req, res) => {
    try {
      const blogId = req.params.id;
      const blog = await storage.getBlog(blogId);
      
      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }
      
      const currentUserId = req.user._id.toString();
      await storage.unbookmarkBlog(currentUserId, blogId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing bookmark:", error);
      res.status(500).json({ message: "Failed to remove bookmark" });
    }
  });
  
  app.get("/api/bookmarks", isAuthenticated, async (req, res) => {
    try {
      const currentUserId = req.user._id.toString();
      const bookmarks = await storage.getBookmarks(currentUserId);
      
      // Enhance blogs with like and comment counts
      const enhancedBlogs = await Promise.all(bookmarks.map(async (blog) => {
        // Use _id if available, otherwise fallback to id
        const blogId = blog._id ? blog._id.toString() : blog.id;
        
        const likeCount = await storage.getLikeCount(blogId);
        const comments = await storage.getComments(blogId);
        const isLiked = await storage.isLikedByUser(currentUserId, blogId);
        
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
      
      // Early validation of userId before any DB operations
      if (!userId || userId === "undefined" || userId === "-1" || userId.length !== 24) {
        return res.status(404).json({ message: "User not found" });
      }
      
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
      if (req.isAuthenticated() && req.user && req.user._id) {
        const currentUserId = req.user._id.toString();
        isFollowing = await storage.isFollowing(currentUserId, userId);
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
      
      console.log("Profile update request:", { displayName, bio, profileImage, coverImage });
      console.log("User object:", req.user);
      
      // Use MongoDB _id instead of id property
      const userId = req.user._id ? req.user._id.toString() : undefined;
      console.log("Extracted userId:", userId);
      
      if (!userId) {
        console.log("No userId found in the request, returning 401");
        return res.status(401).json({ message: "Authentication required" });
      }
      
      console.log("Calling storage.updateUser with userId:", userId);
      const updatedUser = await storage.updateUser(userId, {
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
      // For MongoDB, use the string ID directly (don't parseInt)
      const followingId = req.params.id;
      
      console.log("Follow request - Current user:", req.user?._id);
      console.log("Follow request - User to follow:", followingId);
      
      const userToFollow = await storage.getUser(followingId);
      
      if (!userToFollow) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // For MongoDB, compare string IDs or ObjectIDs
      const currentUserId = req.user?._id?.toString();
      if (followingId === currentUserId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }
      
      await storage.followUser(currentUserId, followingId);
      
      // Create notification
      console.log('Creating follow notification:', { 
        userId: followingId, 
        actorId: currentUserId, 
        type: 'follow' 
      });
      
      try {
        const notification = await storage.createNotification({
          userId: followingId,
          actorId: currentUserId,
          type: 'follow'
        });
        
        console.log('Created notification:', notification);
        
        // Broadcast notification to followed user
        console.log('Broadcasting to user:', followingId);
        broadcastToUser(followingId, {
          type: 'notification',
          notification: {
            type: 'follow',
            actor: req.user
          }
        });
      } catch (err) {
        console.error('Error creating follow notification:', err);
      }
      
      const followers = await storage.getFollowers(followingId);
      
      res.json({ success: true, followerCount: followers.length });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });
  
  app.delete("/api/users/:id/follow", isAuthenticated, async (req, res) => {
    try {
      // For MongoDB, use the string ID directly (don't parseInt)
      const followingId = req.params.id;
      
      console.log("Unfollow request - Current user:", req.user?._id);
      console.log("Unfollow request - User to unfollow:", followingId);
      
      const userToUnfollow = await storage.getUser(followingId);
      
      if (!userToUnfollow) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // For MongoDB, use the string _id
      const currentUserId = req.user?._id?.toString();
      await storage.unfollowUser(currentUserId, followingId);
      
      const followers = await storage.getFollowers(followingId);
      
      res.json({ success: true, followerCount: followers.length });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });
  
  app.get("/api/users/:id/followers", async (req, res) => {
    try {
      // For MongoDB, use the string ID directly
      const userId = req.params.id;
      console.log("Fetching followers for user:", userId);
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.log("User not found:", userId);
        return res.status(404).json({ message: "User not found" });
      }
      
      const followers = await storage.getFollowers(userId);
      console.log(`Found ${followers.length} followers for user ${userId}`);
      
      // If user is authenticated, check which followers they are following
      if (req.isAuthenticated() && req.user) {
        const currentUserId = req.user._id?.toString();
        console.log("Current authenticated user:", currentUserId);
        
        const enhancedFollowers = await Promise.all(followers.map(async (follower) => {
          // Use MongoDB's _id instead of id property
          const followerId = follower._id ? follower._id.toString() : '';
          const isFollowing = await storage.isFollowing(currentUserId, followerId);
          
          return {
            ...follower,
            isFollowing,
            // Compare string IDs for MongoDB
            isCurrentUser: followerId === currentUserId
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
  
  // Online status API endpoint
  app.get("/api/users/:id/status", async (req, res) => {
    try {
      const userId = req.params.id;
      const isOnline = isUserOnline(userId);
      
      // Get last active time if available
      let lastActive = null;
      if (onlineUsers.has(userId)) {
        lastActive = onlineUsers.get(userId)?.lastActive;
      }
      
      res.json({
        isOnline,
        lastActive,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Error checking user status:", error);
      res.status(500).json({ message: "Failed to check user status" });
    }
  });

  app.get("/api/users/:id/is-following", isAuthenticated, async (req, res) => {
    try {
      // For MongoDB, use the string ID directly
      const targetUserId = req.params.id;
      console.log("Checking if current user is following target user:", targetUserId);
      
      // For MongoDB, use the _id property
      const currentUserId = req.user._id?.toString();
      console.log("Current user ID:", currentUserId);
      
      if (!currentUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check if the current user is following the target user
      const isFollowing = await storage.isFollowing(currentUserId, targetUserId);
      console.log(`isFollowing check result: ${isFollowing}`);
      
      res.json({ isFollowing });
    } catch (error) {
      console.error("Error checking follow status:", error);
      res.status(500).json({ message: "Failed to check follow status" });
    }
  });
  
  app.get("/api/users/:id/following", async (req, res) => {
    try {
      // For MongoDB, use the string ID directly
      const userId = req.params.id;
      console.log("Fetching following for user:", userId);
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.log("User not found:", userId);
        return res.status(404).json({ message: "User not found" });
      }
      
      const following = await storage.getFollowing(userId);
      console.log(`Found ${following.length} following for user ${userId}`);
      
      // If user is authenticated, check which users they are following
      if (req.isAuthenticated() && req.user) {
        const currentUserId = req.user._id?.toString();
        console.log("Current authenticated user:", currentUserId);
        
        const enhancedFollowing = await Promise.all(following.map(async (followedUser) => {
          // Use MongoDB's _id instead of id property
          const followedUserId = followedUser._id ? followedUser._id.toString() : '';
          const isFollowing = await storage.isFollowing(currentUserId, followedUserId);
          
          return {
            ...followedUser,
            isFollowing,
            // Compare string IDs for MongoDB
            isCurrentUser: followedUserId === currentUserId
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
      
      console.log("Fetching notifications for user:", req.user?._id?.toString());
      
      // For MongoDB, use the _id property
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const notifications = await storage.getNotifications(userId, limit, offset);
      console.log("Found notifications:", notifications?.length || 0);
      
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  
  app.get("/api/notifications/unread/count", isAuthenticated, async (req, res) => {
    try {
      // For MongoDB, use the _id property
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      console.log("Fetching unread notification count for user:", userId);
      const count = await storage.getUnreadNotificationCount(userId);
      console.log("Unread notification count:", count);
      
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ message: "Failed to fetch unread notification count" });
    }
  });
  
  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      // For MongoDB, use the ID directly (no parseInt)
      const notificationId = req.params.id;
      console.log("Marking notification as read:", notificationId);
      
      const result = await storage.markNotificationAsRead(notificationId);
      console.log("Mark notification as read result:", result);
      
      res.json({ success: result });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });
  
  app.post("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      // For MongoDB, use the _id property
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      console.log("Marking all notifications as read for user:", userId);
      const result = await storage.markAllNotificationsAsRead(userId);
      console.log("Mark all notifications as read result:", result);
      
      res.json({ success: result });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });
  
  // Message Routes
  app.get("/api/messages/conversations", isAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // For MongoDB, use the _id property as a string - handle both id and _id cases
      const userId = req.user._id ? req.user._id.toString() : req.user.id?.toString();
      if (!userId) {
        console.error("User ID missing from authenticated user:", req.user);
        return res.status(401).json({ message: "User ID not found" });
      }
      
      console.log(`Fetching conversations for user: ${userId}`);
      const conversations = await storage.getConversations(userId);
      
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });
  
  // Special public user endpoint for message user information
  app.get("/api/users/message/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Early validation of userId before any DB operations
      if (!userId || userId === "undefined" || userId === "-1" || userId.length !== 24) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return just enough user data for message display
      res.json({
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        profileImage: user.profileImage
      });
    } catch (error) {
      console.error("Error fetching message user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/messages/:userId", isAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // For MongoDB, use the string ID directly
      const otherUserId = req.params.userId;
      console.log(`Fetching messages with user: ${otherUserId}`);
      
      const otherUser = await storage.getUser(otherUserId);
      if (!otherUser) {
        console.error(`Other user not found: ${otherUserId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      // For MongoDB, use the _id property as a string - handle both id and _id cases
      const currentUserId = req.user._id ? req.user._id.toString() : req.user.id?.toString();
      if (!currentUserId) {
        console.error("User ID missing from authenticated user:", req.user);
        return res.status(401).json({ message: "User ID not found" });
      }
      
      console.log(`Getting messages between ${currentUserId} and ${otherUserId}`);
      const messages = await storage.getMessages(currentUserId, otherUserId);
      
      // Mark messages from other user as read
      for (const message of messages) {
        if (message.senderId === otherUserId && !message.read) {
          await storage.markMessageAsRead(message._id.toString());
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
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // For MongoDB, use the string ID directly
      const receiverId = req.params.userId;
      console.log(`API: Sending message to user: ${receiverId}`);
      
      const receiver = await storage.getUser(receiverId);
      if (!receiver) {
        console.error(`Receiver not found: ${receiverId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      const validatedData = insertMessageSchema.parse(req.body);
      
      // For MongoDB, use the _id property as a string - handle both id and _id cases
      const senderId = req.user._id ? req.user._id.toString() : req.user.id?.toString();
      if (!senderId) {
        console.error("User ID missing from authenticated user:", req.user);
        return res.status(401).json({ message: "User ID not found" });
      }
      
      // Check if the client is using this as a fallback and WebSocket is connected
      // This should be rare now with the client-side changes, but we still want to be cautious
      let isConnectedViaWebSocket = false;
      clients.forEach((clientUserId) => {
        if (clientUserId === senderId) {
          isConnectedViaWebSocket = true;
        }
      });
      
      // If client is using a fallback despite being connected via WebSocket,
      // we should check if this is a duplicate of a very recent message
      if (isConnectedViaWebSocket) {
        // Look for a recent message within the last 3 seconds
        const recentMessages = await storage.getMessages(senderId, receiverId, 5);
        const isDuplicate = recentMessages.some(msg => 
          msg.content === validatedData.content && 
          msg.senderId === senderId &&
          // Message sent within the last 3 seconds
          (new Date().getTime() - new Date(msg.createdAt).getTime() < 3000)
        );
        
        if (isDuplicate) {
          console.log(`Detected duplicate message via API, skipping: "${validatedData.content.substring(0, 20)}${validatedData.content.length > 20 ? '...' : ''}"`);
          // Return the most recent message instead of creating a duplicate
          return res.status(201).json(recentMessages[0]);
        }
      }
      
      console.log(`API: Sending message from ${senderId} to ${receiverId}: "${validatedData.content.substring(0, 20)}${validatedData.content.length > 20 ? '...' : ''}"`);
      
      const message = await storage.sendMessage({
        senderId,
        receiverId,
        content: validatedData.content
      });
      
      console.log(`API: Message saved with ID: ${message._id}`);
      
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
  
  // Move conversation deletion route above single message deletion
  // (order matters in Express, more specific routes should come first)
  app.delete("/api/messages/conversation/:userId", isAuthenticated, async (req, res) => {
    try {
      const currentUserId = req.user._id ? req.user._id.toString() : req.user.id?.toString();
      const otherUserId = req.params.userId;
      
      // Use imported mongoose to access the Message model directly for efficient deletion
      const Message = mongoose.model('Message');
      
      // Delete messages in both directions (sent and received)
      const result = await Message.deleteMany({
        $or: [
          { sender: currentUserId, receiver: otherUserId },
          { sender: otherUserId, receiver: currentUserId }
        ]
      });
      
      // Broadcast deletion to both users
      broadcastToUser(currentUserId, {
        type: 'conversation_deleted',
        withUser: otherUserId,
        deletedCount: result.deletedCount
      });
      
      broadcastToUser(otherUserId, {
        type: 'conversation_deleted',
        withUser: currentUserId,
        deletedCount: result.deletedCount
      });
      
      res.status(200).json({ 
        message: 'Conversation deleted successfully',
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ message: 'Failed to delete conversation' });
    }
  });
  
  // Delete a single message (this route needs to come after more specific routes)
  app.delete("/api/messages/:messageId", isAuthenticated, async (req, res) => {
    try {
      const messageId = req.params.messageId;
      
      // For MongoDB, use the _id property as a string
      const currentUserId = req.user._id ? req.user._id.toString() : req.user.id?.toString();
      
      // Get the message
      const message = await storage.getMessageById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      // Check if user is authorized (message sender)
      if (String(message.senderId) !== currentUserId) {
        return res.status(403).json({ message: "Not authorized to delete this message" });
      }
      
      // Delete the message
      const success = await storage.deleteMessage(messageId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to delete message" });
      }
      
      // Notify both users about the message deletion
      const otherUserId = String(message.senderId) === currentUserId 
        ? String(message.receiverId) 
        : String(message.senderId);
      
      // Broadcast to both users
      broadcastToUser(currentUserId, {
        type: 'message_deleted',
        messageId
      });
      
      broadcastToUser(otherUserId, {
        type: 'message_deleted',
        messageId
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });
  


  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at ${uploadsDir}`);
  }
  
  // Set proper permissions on uploads directory
  try {
    fs.chmodSync(uploadsDir, 0o777);
    console.log(`Set permissions on uploads directory at ${uploadsDir}`);
  } catch (err) {
    console.error('Error setting permissions on uploads directory:', err);
  }
  
  // Serve uploads directory for uploaded images
  app.use('/uploads', express.static(uploadsDir));
  
  // Serve test upload HTML page
  app.get('/test-upload', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'test-upload.html'));
  });
  
  // Simple test upload endpoint - no authentication required
  app.post('/api/test-upload', upload.single('testFile'), (req, res) => {
    console.log("TEST UPLOAD ENDPOINT CALLED");
    try {
      if (!req.file) {
        console.error("No file uploaded in test request");
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Log file details 
      console.log("Test upload - File details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });

      // Verify file exists on disk
      const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
      const fileExists = fs.existsSync(fullPath);
      console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
      
      if (!fileExists) {
        return res.status(500).json({ 
          success: false, 
          message: 'File upload failed - file not found on disk' 
        });
      }

      // Return success with file URL
      const fileUrl = `/uploads/${req.file.filename}`;
      res.status(200).json({ 
        success: true,
        message: 'File uploaded successfully',
        fileUrl: fileUrl,
        fullPath: fullPath,
        filename: req.file.filename
      });
    } catch (error) {
      console.error('Error in test upload:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to upload file', 
        error: error.message 
      });
    }
  });

  // Add file upload endpoints for profile and cover images
  app.post('/api/upload/profile-image', isAuthenticated, upload.single('profileImage'), async (req, res) => {
    console.log("PROFILE IMAGE UPLOAD ENDPOINT CALLED");
    console.log("Request user:", req.user);
    console.log("Request file:", req.file ? "File present" : "No file");
    console.log("Request body:", req.body);
    
    try {
      if (!req.file) {
        console.error("No file uploaded in profile image request");
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Log file details 
      console.log("Profile image upload - File details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });

      // Create relative URL to uploaded file
      const fileUrl = `/uploads/${req.file.filename}`;
      
      // Verify file exists on disk
      const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
      const fileExists = fs.existsSync(fullPath);
      console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
      
      if (!fileExists) {
        return res.status(500).json({ 
          success: false, 
          message: 'File upload failed - file not found on disk' 
        });
      }
      
      // Get user ID from the authenticated user
      const userId = req.user?._id?.toString();
      console.log("Profile image upload - User ID:", userId);
      
      if (!userId) {
        console.error("No userId found in profile image upload request");
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }

      // Update the user's profile with the new image URL
      console.log("Updating user profile with image URL:", fileUrl);
      const updatedUser = await storage.updateUser(userId, {
        profileImage: fileUrl
      });
      
      if (!updatedUser) {
        console.error("Failed to update user with profile image URL");
        return res.status(500).json({ 
          success: false, 
          message: "Failed to update user profile" 
        });
      }
      
      console.log("Profile image successfully updated for user:", userId);

      // Return the URL to the uploaded file
      res.json({ 
        success: true, 
        message: "Profile image uploaded successfully",
        fileUrl: fileUrl 
      });
    } catch (error) {
      console.error('Error uploading profile image:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to upload profile image',
        error: error.message 
      });
    }
  });

  app.post('/api/upload/cover-image', isAuthenticated, upload.single('coverImage'), async (req, res) => {
    console.log("COVER IMAGE UPLOAD ENDPOINT CALLED");
    console.log("Request user:", req.user);
    console.log("Request file:", req.file ? "File present" : "No file");
    console.log("Request body:", req.body);
    
    try {
      if (!req.file) {
        console.error("No file uploaded in cover image request");
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Log file details
      console.log("Cover image upload - File details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });
      
      // Create relative URL to uploaded file
      const fileUrl = `/uploads/${req.file.filename}`;
      
      // Verify file exists on disk
      const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
      const fileExists = fs.existsSync(fullPath);
      console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
      
      if (!fileExists) {
        return res.status(500).json({ 
          success: false, 
          message: 'File upload failed - file not found on disk' 
        });
      }
      
      // Get user ID from the authenticated user
      const userId = req.user?._id?.toString();
      console.log("Cover image upload - User ID:", userId);
      
      if (!userId) {
        console.error("No userId found in cover image upload request");
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }

      // Update the user's profile with the new cover image URL
      console.log("Updating user profile with cover image URL:", fileUrl);
      const updatedUser = await storage.updateUser(userId, {
        coverImage: fileUrl
      });
      
      if (!updatedUser) {
        console.error("Failed to update user with cover image URL");
        return res.status(500).json({ 
          success: false, 
          message: "Failed to update user profile" 
        });
      }
      
      console.log("Cover image successfully updated for user:", userId);

      // Return the URL to the uploaded file
      res.json({ 
        success: true, 
        message: "Cover image uploaded successfully",
        fileUrl: fileUrl 
      });
    } catch (error) {
      console.error('Error uploading cover image:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to upload cover image',
        error: error.message 
      });
    }
  });
  
  // Add blog image upload endpoint
  app.post('/api/upload/blog-image', isAuthenticated, upload.single('blogImage'), async (req, res) => {
    console.log("BLOG IMAGE UPLOAD ENDPOINT CALLED");
    console.log("Request user:", req.user);
    console.log("Request file:", req.file ? "File present" : "No file");
    console.log("Request body:", req.body);
    
    try {
      if (!req.file) {
        console.error("No file uploaded in blog image request");
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Log file details 
      console.log("Blog image upload - File details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });

      // Create relative URL to uploaded file
      const imageUrl = `/uploads/${req.file.filename}`;
      
      // Verify file exists on disk
      const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
      const fileExists = fs.existsSync(fullPath);
      console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
      
      if (!fileExists) {
        return res.status(500).json({ 
          success: false, 
          message: 'File upload failed - file not found on disk' 
        });
      }

      // Return the URL to the uploaded file
      res.status(201).json({
        success: true,
        message: "Blog image uploaded successfully",
        imageUrl
      });
    } catch (error) {
      console.error("Error uploading blog image:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to upload blog image',
        error: (error as Error).message 
      });
    }
  });
  
  return httpServer;
}
