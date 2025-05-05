import { db, User, Blog, Comment, Like, Bookmark, Follower } from "./index";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import mongoose from "mongoose";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seed() {
  try {
    console.log("Starting seed...");

    // Check if users already exist
    const existingUsers = await User.find();
    if (existingUsers.length > 0) {
      console.log("Data already exists, skipping seed");
      return;
    }

    // Create sample users
    const usersData = [
      {
        username: "sarahwilson",
        password: await hashPassword("password123"),
        displayName: "Sarah Wilson",
        bio: "Digital marketing specialist and tech enthusiast. Writing about remote work, productivity, and industry trends.",
        profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "davidtech",
        password: await hashPassword("password123"),
        displayName: "David Chen",
        bio: "Software engineer and AI enthusiast. Exploring the intersection of technology and human creativity.",
        profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "emilyreads",
        password: await hashPassword("password123"),
        displayName: "Emily Parker",
        bio: "Book lover, business consultant, and lifelong learner. Sharing insights on leadership and personal growth.",
        profileImage: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "alexjohnson",
        password: await hashPassword("password123"),
        displayName: "Alex Johnson",
        bio: "Product manager and design enthusiast. Passionate about creating user-centered experiences that make a difference.",
        profileImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "markanderson",
        password: await hashPassword("password123"),
        displayName: "Mark Anderson",
        bio: "Entrepreneur and startup advisor. Helping founders navigate the challenges of building successful businesses.",
        profileImage: "https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      },
      {
        username: "rebeccawrites",
        password: await hashPassword("password123"),
        displayName: "Rebecca Lee",
        bio: "Content creator and social media strategist. Crafting compelling stories that engage and inspire audiences.",
        profileImage: "https://images.unsplash.com/photo-1607746882042-944635dfe10e?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      }
    ];

    // Insert users
    const users = await User.insertMany(usersData);
    console.log(`Created ${users.length} users`);

    // Create sample blogs
    const blogsData = [
      {
        title: "The Future of Remote Work: 5 Trends to Watch in 2023",
        content: "The pandemic has permanently changed how we work. As we move forward, several key trends are emerging that will shape remote work in 2023 and beyond. From asynchronous communication becoming the norm to the rise of digital nomad visas worldwide, organizations need to adapt quickly.\n\nThis shift isn't just about where we work, but how we work. Companies that embrace these changes are seeing higher productivity and employee satisfaction. But challenges remain, particularly around maintaining company culture and preventing burnout.\n\nWhat remote work trends are you seeing in your industry? How is your organization adapting?",
        image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=675&q=80",
        author: users[0]._id
      },
      {
        title: "Why AI Won't Replace Programmers (Yet)",
        content: "With the rise of AI coding assistants like GitHub Copilot and ChatGPT, there's growing concern about AI replacing developers. But after working with these tools daily, I've found they're more like sophisticated autocomplete than true replacements.\n\nThe real value of a developer lies in understanding business requirements, architecting solutions, and making trade-off decisions - areas where AI still struggles.\n\nAI is great at generating boilerplate code and suggesting solutions for common problems, but it falls short in understanding complex requirements, system architecture, and troubleshooting subtle bugs. In fact, the most effective developers I know have embraced these tools to handle routine tasks while focusing their creativity on solving more interesting, complex problems.",
        author: users[1]._id
      },
      {
        title: "5 Books That Changed How I Think About Business",
        content: "Reading has always been my secret weapon for personal growth. These five books fundamentally shifted my perspective on business and leadership:\n\n1. \"Zero to One\" by Peter Thiel - This book challenged my thinking about innovation and the importance of creating something truly new rather than incrementally improving existing ideas.\n\n2. \"Thinking in Systems\" by Donella Meadows - Understanding systems thinking has transformed how I approach complex problems and view organizations as interconnected entities.\n\n3. \"Never Split the Difference\" by Chris Voss - The negotiation tactics from this former FBI hostage negotiator apply brilliantly to business contexts, teaching me that emotional intelligence trumps pure logic.\n\n4. \"Atomic Habits\" by James Clear - Small, consistent actions compound dramatically over time. This book gave me practical frameworks for personal and team improvement.\n\n5. \"The Infinite Game\" by Simon Sinek - Shifting from a finite to an infinite mindset has changed how I think about competition, innovation, and building for the long term.",
        image: "https://images.unsplash.com/photo-1513001900722-370f803f498d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=675&q=80",
        author: users[2]._id
      },
      {
        title: "Designing Products People Actually Want to Use",
        content: "After a decade in product design, I've learned that creating products people love comes down to solving real problems in intuitive ways. Too often, teams get caught up in feature lists or copying competitors rather than focusing on what truly matters to users.\n\nThe most successful products I've worked on all started with deep user research. We spent time understanding user pain points, workflows, and contexts before writing a single line of code or creating any mockups.\n\nPrototyping early and often is crucial. Get your ideas in front of real users quickly, even if they're crude sketches. The feedback you'll receive is invaluable and will save countless hours of development on features nobody wants.\n\nFinally, focus on removing friction rather than adding features. The best products feel invisible - they help users accomplish their goals with minimal cognitive load or unnecessary steps.",
        author: users[3]._id
      },
      {
        title: "Three Fundraising Mistakes First-Time Founders Make",
        content: "Having advised dozens of startups through their first fundraising rounds, I've noticed the same mistakes appear repeatedly:\n\n1. Raising too early: Many founders rush to raise venture capital before validating their idea or showing meaningful traction. Smart investors want to see evidence that your solution addresses a real problem people will pay for.\n\n2. Targeting the wrong investors: Not all money is equal. Research investors who have expertise in your domain and a track record of supporting companies at your stage. A strategic investor who understands your market can provide more than just capital.\n\n3. Focusing on valuation above all else: While a high valuation might feel like validation, it can create unrealistic expectations for future rounds. I've seen many startups struggle with down rounds or difficult terms because they optimized for valuation rather than finding the right partner.\n\nThe fundraising process is about building relationships, not just securing capital. Take the time to find investors who genuinely believe in your vision and can help you navigate the challenges ahead.",
        author: users[4]._id
      },
      {
        title: "Building an Audience-First Content Strategy",
        content: "The most common content marketing mistake I see brands making is creating content for themselves rather than their audience. Your blog posts, videos, and social media updates should address the needs, questions, and interests of your target customers - not showcase how great your product is.\n\nStart by developing detailed audience personas based on real research, not assumptions. What challenges are they facing? What questions do they have? Where do they go for information?\n\nUse SEO tools to identify high-intent search queries in your niche. These represent real people actively seeking information related to your products or services.\n\nCreate content that genuinely helps people solve problems or achieve goals, without immediately pushing for a sale. The trust you build through valuable content ultimately drives conversions more effectively than pushy sales messages.\n\nFinally, remember that distribution is as important as creation. Identify where your audience spends time online and develop channel-specific strategies to reach them effectively.",
        author: users[5]._id
      }
    ];

    // Insert blogs
    const blogs = await Blog.insertMany(blogsData);
    console.log(`Created ${blogs.length} blogs`);

    // Create followers relationships
    const followersData = [
      { follower: users[3]._id, following: users[0]._id },
      { follower: users[3]._id, following: users[1]._id },
      { follower: users[3]._id, following: users[2]._id },
      { follower: users[4]._id, following: users[0]._id },
      { follower: users[5]._id, following: users[0]._id },
      { follower: users[1]._id, following: users[0]._id },
      { follower: users[2]._id, following: users[0]._id },
      { follower: users[0]._id, following: users[1]._id },
      { follower: users[2]._id, following: users[1]._id },
      { follower: users[4]._id, following: users[1]._id },
      { follower: users[0]._id, following: users[2]._id },
      { follower: users[1]._id, following: users[2]._id },
      { follower: users[5]._id, following: users[2]._id },
      { follower: users[0]._id, following: users[3]._id },
      { follower: users[2]._id, following: users[3]._id },
      { follower: users[5]._id, following: users[3]._id },
      { follower: users[0]._id, following: users[4]._id },
      { follower: users[1]._id, following: users[5]._id },
      { follower: users[2]._id, following: users[5]._id },
      { follower: users[3]._id, following: users[5]._id }
    ];

    await Follower.insertMany(followersData);
    console.log(`Created follower relationships`);

    // Create likes
    const likesData = [
      { user: users[3]._id, blog: blogs[0]._id },
      { user: users[4]._id, blog: blogs[0]._id },
      { user: users[5]._id, blog: blogs[0]._id },
      { user: users[1]._id, blog: blogs[0]._id },
      { user: users[0]._id, blog: blogs[1]._id },
      { user: users[3]._id, blog: blogs[1]._id },
      { user: users[4]._id, blog: blogs[1]._id },
      { user: users[5]._id, blog: blogs[1]._id },
      { user: users[0]._id, blog: blogs[2]._id },
      { user: users[1]._id, blog: blogs[2]._id },
      { user: users[3]._id, blog: blogs[2]._id },
      { user: users[4]._id, blog: blogs[2]._id },
      { user: users[0]._id, blog: blogs[3]._id },
      { user: users[1]._id, blog: blogs[3]._id },
      { user: users[2]._id, blog: blogs[3]._id },
      { user: users[5]._id, blog: blogs[3]._id },
      { user: users[0]._id, blog: blogs[4]._id },
      { user: users[1]._id, blog: blogs[4]._id },
      { user: users[2]._id, blog: blogs[4]._id },
      { user: users[3]._id, blog: blogs[4]._id },
      { user: users[0]._id, blog: blogs[5]._id },
      { user: users[1]._id, blog: blogs[5]._id },
      { user: users[3]._id, blog: blogs[5]._id },
      { user: users[4]._id, blog: blogs[5]._id }
    ];

    await Like.insertMany(likesData);
    console.log(`Created likes`);

    // Create comments
    const commentsData = [
      { content: "Great insights! I've noticed the same trends in my company. The flexibility of async work has been a game-changer for our team.", user: users[3]._id, blog: blogs[0]._id },
      { content: "I'm curious how companies are handling the time zone challenges with remote teams. Any tips?", user: users[1]._id, blog: blogs[0]._id },
      { content: "This resonates with me so much. I'm using Copilot daily, and while it's helpful, it's definitely not replacing my job anytime soon!", user: users[0]._id, blog: blogs[1]._id },
      { content: "I'd add that understanding legacy code is another area where AI struggles. Context and history matter so much in real-world codebases.", user: users[4]._id, blog: blogs[1]._id },
      { content: "Just ordered 'Zero to One' based on your recommendation. I've been stuck in incremental thinking lately and need a fresh perspective.", user: users[0]._id, blog: blogs[2]._id },
      { content: "I'd add 'Range' by David Epstein to this list. It changed how I think about expertise and skill development.", user: users[1]._id, blog: blogs[2]._id },
      { content: "The point about reducing friction rather than adding features is so important. I've seen many products fail because they became too complex.", user: users[2]._id, blog: blogs[3]._id },
      { content: "How do you balance getting quick feedback with ensuring you're not biasing users with under-developed prototypes?", user: users[5]._id, blog: blogs[3]._id },
      { content: "The point about targeting the right investors is key. I wasted months pitching to VCs who never invest in hardware startups.", user: users[1]._id, blog: blogs[4]._id },
      { content: "What's your take on convertible notes vs. priced rounds for first-time fundraising?", user: users[3]._id, blog: blogs[4]._id },
      { content: "I've been making the mistake of creating content about our product instead of addressing customer problems. This was a wake-up call!", user: users[0]._id, blog: blogs[5]._id },
      { content: "Any tips for finding out where your audience actually spends time online? Surveys haven't been very reliable for us.", user: users[3]._id, blog: blogs[5]._id }
    ];

    await Comment.insertMany(commentsData);
    console.log(`Created comments`);

    // Create bookmarks
    const bookmarksData = [
      { user: users[3]._id, blog: blogs[0]._id },
      { user: users[3]._id, blog: blogs[2]._id },
      { user: users[0]._id, blog: blogs[1]._id },
      { user: users[0]._id, blog: blogs[4]._id },
      { user: users[1]._id, blog: blogs[2]._id },
      { user: users[1]._id, blog: blogs[5]._id },
      { user: users[2]._id, blog: blogs[0]._id },
      { user: users[2]._id, blog: blogs[3]._id },
      { user: users[4]._id, blog: blogs[1]._id },
      { user: users[5]._id, blog: blogs[2]._id }
    ];

    await Bookmark.insertMany(bookmarksData);
    console.log(`Created bookmarks`);

    console.log("Seed completed successfully!");
  } catch (error) {
    console.error("Error during seeding:", error);
  }
}

// Run the seed function
seed().then(() => {
  console.log("Done seeding. Closing database connection.");
  mongoose.connection.close();
}).catch(error => {
  console.error("Error during seed execution:", error);
  mongoose.connection.close();
});