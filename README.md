# Blog Application

A full-stack blog application with React frontend and Node.js backend.

## Features

- User authentication and registration
- Create, edit, and delete blog posts
- Like and comment on posts
- Follow other users
- Real-time messaging
- Bookmark posts
- Search functionality
- Responsive design

## Project Structure

```
├── client/          # React frontend application
├── server-deploy/   # Node.js/Express backend application
└── DEPLOYMENT_GUIDE.md  # Complete deployment instructions
```

## Local Development

1. Clone the repository
2. Set up MongoDB connection
3. Install dependencies and start both services:

```bash
# Install dependencies
npm install

# Start the application
npm run dev
```

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete deployment instructions for:
- Render
- Vercel + Railway
- Netlify + Render

## Environment Variables

**Backend:**
- `MONGODB_URI`: MongoDB connection string
- `SESSION_SECRET`: Session secret key
- `CLIENT_URL`: Frontend URL for CORS

**Frontend:**
- `VITE_API_URL`: Backend API URL

## Technology Stack

**Frontend:**
- React 18
- TypeScript
- Tailwind CSS
- Shadcn/ui components
- React Query (TanStack Query)
- Wouter (routing)

**Backend:**
- Node.js
- Express
- MongoDB with Mongoose
- WebSocket support
- Passport.js authentication