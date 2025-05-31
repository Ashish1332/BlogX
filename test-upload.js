import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
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
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."));
    }
  }
});

// Serve the uploads directory
app.use('/uploads', express.static('uploads'));

// Serve HTML form for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>File Upload Test</title>
    </head>
    <body>
      <h1>Test Profile Image Upload</h1>
      <form action="/upload/profile-image" method="post" enctype="multipart/form-data">
        <input type="file" name="profileImage" accept="image/*">
        <button type="submit">Upload Profile Image</button>
      </form>
      
      <h1>Test Cover Image Upload</h1>
      <form action="/upload/cover-image" method="post" enctype="multipart/form-data">
        <input type="file" name="coverImage" accept="image/*">
        <button type="submit">Upload Cover Image</button>
      </form>
      
      <div id="result"></div>
    </body>
    </html>
  `);
});

// Profile image upload endpoint
app.post('/upload/profile-image', upload.single('profileImage'), (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Log file details
    console.log('Profile image upload details:', {
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
    
    // Verify file exists
    const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
    const fileExists = fs.existsSync(fullPath);
    console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
    
    if (!fileExists) {
      return res.status(500).json({ success: false, message: 'File upload failed - file not found on disk' });
    }

    // Return success with file URL
    res.status(200).json({ 
      success: true,
      message: 'Profile image uploaded successfully',
      fileUrl: fileUrl,
      fullPath: fullPath
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ success: false, message: 'Failed to upload profile image', error: error.message });
  }
});

// Cover image upload endpoint
app.post('/upload/cover-image', upload.single('coverImage'), (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Log file details
    console.log('Cover image upload details:', {
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
    
    // Verify file exists
    const fullPath = path.join(process.cwd(), 'uploads', req.file.filename);
    const fileExists = fs.existsSync(fullPath);
    console.log(`File existence check (${fullPath}):`, fileExists ? "EXISTS" : "MISSING");
    
    if (!fileExists) {
      return res.status(500).json({ success: false, message: 'File upload failed - file not found on disk' });
    }

    // Return success with file URL
    res.status(200).json({ 
      success: true,
      message: 'Cover image uploaded successfully',
      fileUrl: fileUrl,
      fullPath: fullPath
    });
  } catch (error) {
    console.error('Error uploading cover image:', error);
    res.status(500).json({ success: false, message: 'Failed to upload cover image', error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Test upload server running on port ${PORT}`);
});