# Quick Deploy Guide

## 🚀 Deploy in 3 Steps

### Step 1: Prepare Your Repository
1. Push all code to GitHub/GitLab/Bitbucket
2. Make sure you have your MongoDB connection string ready

### Step 2: Deploy Backend (Choose One Platform)

**Option A: Render.com**
- Go to render.com → New Web Service
- Connect repository → Select `server-deploy` folder
- Build: `npm install && npm run build`
- Start: `npm start`
- Add environment variables:
  - `MONGODB_URI`: your_mongo_connection_string
  - `SESSION_SECRET`: any_random_string_here
- Deploy & copy the URL

**Option B: Railway.app**
- Go to railway.app → New Project from GitHub
- Select `server-deploy` folder
- Add same environment variables as above
- Deploy & copy the URL

### Step 3: Deploy Frontend (Choose One Platform)

**Option A: Vercel.com**
- Go to vercel.com → New Project
- Select repository → Set root directory to `client`
- Add environment variable:
  - `VITE_API_URL`: your_backend_url_from_step_2
- Deploy

**Option B: Netlify.com**
- Go to netlify.com → New site from Git
- Base directory: `client`
- Build: `npm run build`
- Publish: `client/dist`
- Add environment variable:
  - `VITE_API_URL`: your_backend_url_from_step_2
- Deploy

### Step 4: Final Configuration
- Go back to your backend platform
- Add environment variable:
  - `CLIENT_URL`: your_frontend_url_from_step_3
- Your app is now live!

## Environment Variables Summary

**Backend needs:**
- `MONGODB_URI` (your database)
- `SESSION_SECRET` (any random string)
- `CLIENT_URL` (your frontend URL)

**Frontend needs:**
- `VITE_API_URL` (your backend URL)

## Test Your Deployment
1. Visit frontend URL
2. Create account
3. Login and create a blog post
4. Everything should work!