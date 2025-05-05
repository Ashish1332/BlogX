import mongoose from 'mongoose';
import * as models from './models';

if (!process.env.MONGODB_URI) {
  throw new Error(
    "MONGODB_URI must be set. Did you forget to provide a MongoDB connection string?",
  );
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Export the connection and models
export const db = mongoose.connection;
export const { 
  User, 
  Blog, 
  Comment, 
  Like, 
  Bookmark, 
  Follower, 
  Notification, 
  Message 
} = models;