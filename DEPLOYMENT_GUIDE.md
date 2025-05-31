# Blog Application Deployment Guide

This guide will help you deploy your blog application with separate frontend and backend to popular hosting platforms.

## Project Structure

Your application is now organized as:
```
├── client/          # Frontend React application
├── server-deploy/   # Backend Node.js/Express application
└── DEPLOYMENT_GUIDE.md
```

## Prerequisites

1. **MongoDB Database**: You'll need a MongoDB connection string
   - Get one from [MongoDB Atlas](https://cloud.mongodb.com) (free tier available)
   - Or use your existing MongoDB connection

2. **Git Repository**: Push your code to GitHub, GitLab, or Bitbucket

## Deployment Options

### Option 1: Render (Recommended - Easiest)

**Deploy Backend:**
1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Select the `server-deploy` folder as the root directory
5. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Node Version**: 18
6. Add Environment Variables:
   - `MONGODB_URI`: your MongoDB connection string
   - `SESSION_SECRET`: any long random string (e.g., `my-super-secret-session-key-12345`)
   - `CLIENT_URL`: (leave empty for now, add after frontend deployment)
7. Click "Create Web Service"
8. **Copy the backend URL** (e.g., `https://your-app-backend.onrender.com`)

**Deploy Frontend:**
1. Click "New +" → "Static Site"
2. Connect your Git repository
3. Select the `client` folder as the root directory
4. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
5. Add Environment Variable:
   - `VITE_API_URL`: your backend URL from step 8 above
6. Click "Create Static Site"
7. **Update backend**: Go back to your backend service → Environment → Add:
   - `CLIENT_URL`: your frontend URL

### Option 2: Vercel (Frontend) + Railway (Backend)

**Deploy Backend on Railway:**
1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository and choose the `server-deploy` folder
4. Add Environment Variables:
   - `MONGODB_URI`: your MongoDB connection string
   - `SESSION_SECRET`: any long random string
   - `CLIENT_URL`: (add after frontend deployment)
5. **Copy the backend URL**

**Deploy Frontend on Vercel:**
1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click "New Project"
3. Import your Git repository
4. Configure:
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variable:
   - `VITE_API_URL`: your backend URL from Railway
6. Deploy
7. **Update Railway**: Add your Vercel URL to `CLIENT_URL` in Railway

### Option 3: Netlify (Frontend) + Render (Backend)

**Deploy Backend on Render:**
(Follow same steps as Option 1 backend deployment)

**Deploy Frontend on Netlify:**
1. Go to [netlify.com](https://netlify.com) and sign up/login
2. Click "New site from Git"
3. Connect your repository
4. Configure:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
5. Add Environment Variable:
   - `VITE_API_URL`: your backend URL
6. Deploy
7. **Update Render**: Add your Netlify URL to `CLIENT_URL`

## Environment Variables Summary

**Backend Environment Variables:**
- `MONGODB_URI`: Your MongoDB connection string
- `SESSION_SECRET`: Random secret key for sessions
- `CLIENT_URL`: Your frontend URL (for CORS)
- `PORT`: (automatically set by hosting platforms)

**Frontend Environment Variables:**
- `VITE_API_URL`: Your backend URL

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure `CLIENT_URL` in backend matches your frontend URL exactly
2. **Database Connection**: Verify your `MONGODB_URI` is correct
3. **Build Failures**: Check that both `client` and `server-deploy` folders have their own `package.json`
4. **API Not Working**: Ensure `VITE_API_URL` includes `https://` and no trailing slash

### Testing Your Deployment:

1. **Backend Health Check**: Visit `https://your-backend-url.com/health`
   - Should return: `{"status":"OK","timestamp":"..."}`

2. **Frontend**: Visit your frontend URL
   - Should load the login page
   - Try creating an account and logging in

## Quick Setup Checklist

- [ ] Push code to Git repository
- [ ] Deploy backend with MongoDB URI
- [ ] Deploy frontend with backend URL
- [ ] Update backend with frontend URL
- [ ] Test registration and login
- [ ] Test creating a blog post

## Need Help?

If you encounter issues:
1. Check the deployment logs in your hosting platform
2. Verify all environment variables are set correctly
3. Ensure your MongoDB connection string is valid
4. Check that URLs don't have trailing slashes

Your blog application should now be live and fully functional!