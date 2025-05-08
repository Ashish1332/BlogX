import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Define Blog schema and model
const BlogSchema = new mongoose.Schema({
  title: String,
  content: String,
  image: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: String,
  hashtags: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Blog = mongoose.model('Blog', BlogSchema);

// Function to update blogs with hashtags
async function updateBlogsWithHashtags() {
  try {
    // Get all blogs
    const blogs = await Blog.find({});
    console.log(`Found ${blogs.length} blogs to update`);

    // Hashtags mapping based on blog content/title
    const hashtagsMap = {
      'artificial intelligence': ['#AI', '#MachineLearning', '#Tech', '#Innovation'],
      'devops': ['#DevOps', '#CI/CD', '#Development', '#Automation'],
      'environment': ['#Environment', '#ClimateChange', '#Sustainability', '#GreenTech']
    };

    // Update each blog with relevant hashtags
    for (const blog of blogs) {
      let hashtags = [];
      const title = blog.title.toLowerCase();
      const content = blog.content ? blog.content.toLowerCase() : '';
      
      // Check title and content against our keywords
      for (const [keyword, tags] of Object.entries(hashtagsMap)) {
        if (title.includes(keyword) || content.includes(keyword)) {
          hashtags = [...hashtags, ...tags];
        }
      }
      
      // If no specific hashtags matched, use some general ones based on category
      if (hashtags.length === 0 && blog.category) {
        const category = blog.category.toLowerCase();
        switch (category) {
          case 'technology':
            hashtags = ['#Technology', '#Innovation', '#Tech'];
            break;
          case 'science':
            hashtags = ['#Science', '#Research', '#Discovery'];
            break;
          case 'environment':
            hashtags = ['#Environment', '#ClimateAction', '#Sustainability'];
            break;
          case 'business':
            hashtags = ['#Business', '#Entrepreneurship', '#StartUp'];
            break;
          default:
            hashtags = ['#BlogX', '#Trending', '#MustRead'];
        }
      }
      
      // Ensure we have unique hashtags
      hashtags = [...new Set(hashtags)];
      
      // Update the blog
      if (hashtags.length > 0) {
        await Blog.updateOne({ _id: blog._id }, { $set: { hashtags } });
        console.log(`Updated blog "${blog.title}" with hashtags: ${hashtags.join(', ')}`);
      } else {
        console.log(`No hashtags found for blog "${blog.title}"`);
      }
    }
    
    console.log('Finished updating blogs with hashtags');
    process.exit(0);
  } catch (error) {
    console.error('Error updating blogs with hashtags:', error);
    process.exit(1);
  }
}

// Run the function
updateBlogsWithHashtags();