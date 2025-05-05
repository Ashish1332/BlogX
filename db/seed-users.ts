import { User } from "./models";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import mongoose from "mongoose";

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI!)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seedUsers() {
  try {
    console.log("Starting user seed...");

    // Delete existing users
    await User.deleteMany({});
    console.log("Deleted existing users");

    // Create sample users
    const usersData = [
      {
        username: "ashish",
        password: await hashPassword("ashish"),
        displayName: "Ashish",
        bio: "Digital marketing specialist and tech enthusiast.",
        profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "pranav",
        password: await hashPassword("pranav"),
        displayName: "Pranav",
        bio: "Software engineer and AI enthusiast.",
        profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "pranjal",
        password: await hashPassword("pranjal"),
        displayName: "Pranjal",
        bio: "Book lover and lifelong learner.",
        profileImage: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "kunal",
        password: await hashPassword("kunal"),
        displayName: "Kunal",
        bio: "Product manager and design enthusiast.",
        profileImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "shreya",
        password: await hashPassword("shreya"),
        displayName: "Shreya",
        bio: "Entrepreneur and startup advisor.",
        profileImage: "https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "aryan",
        password: await hashPassword("aryan"),
        displayName: "Aryan",
        bio: "Content creator and social media strategist.",
        profileImage: "https://images.unsplash.com/photo-1607746882042-944635dfe10e?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      }
    ];

    // Insert users
    const users = await User.insertMany(usersData);
    console.log(`Created ${users.length} users`);
    
    console.log("User seed completed successfully!");
  } catch (error) {
    console.error("Error during user seeding:", error);
  } finally {
    mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

seedUsers();
