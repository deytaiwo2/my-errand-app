# Backend Deployment Guide

## Option 1: Railway (Recommended - Easiest)

Railway provides Node.js hosting with built-in database support.

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

### 2. Create New Project
- Click "New Project"
- Choose "Deploy from GitHub repo"
- Connect your repository

### 3. Configure Environment Variables
In Railway dashboard, go to your project → Variables, and add:

```
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com

# Database (Railway provides PostgreSQL, but we'll use external MySQL/MongoDB)
MYSQL_HOST=your-external-mysql-host
MYSQL_USER=your-mysql-user
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=your-database-name

MONGO_URI=your-mongodb-connection-string

JWT_SECRET=generate-a-secure-random-string
JWT_EXPIRY=7d

PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_SECRET=your-paypal-secret

STRIPE_SECRET=sk_test_your-stripe-secret-key
```

### 4. Deploy
Railway will automatically detect it's a Node.js app and deploy it.

## Option 2: Render

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up

### 2. Create Web Service
- Click "New" → "Web Service"
- Connect your GitHub repo
- Configure:
  - Runtime: Node
  - Build Command: `npm install`
  - Start Command: `npm start`

### 3. Add Environment Variables
Same variables as above.

## Option 3: DigitalOcean App Platform

### 1. Create App Spec
Create `app.yaml` in your project root:

```yaml
name: my-errand-app-backend
services:
- name: backend
  source_dir: /
  github:
    repo: Todyents/my-errand-app
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: PORT
    value: "5000"
  - key: NODE_ENV
    value: "production"
  # Add other environment variables here
```

### 2. Deploy to DigitalOcean
- Go to DigitalOcean App Platform
- Create app from source code
- Upload or connect repo

## Database Setup

### For MySQL:
- Use a cloud database like PlanetScale, AWS RDS, or DigitalOcean Managed Database
- Get the connection details and update environment variables

### For MongoDB:
- Use MongoDB Atlas (free tier available)
- Get the connection string and update MONGO_URI

## After Deployment

1. **Update Cloudflare Pages API_BASE**
   - In Cloudflare Pages settings → Environment variables
   - Set `API_BASE` to your backend URL (e.g., `https://my-errand-app-backend.railway.app`)

2. **Test the Integration**
   - Visit your frontend domain
   - Try logging in or creating an account
   - Check browser console for API errors

3. **Update CORS (if needed)**
   - Add your production domain to the `allowedOrigins` in `app.js`
   - Or set `FRONTEND_URL` environment variable

## Troubleshooting

- **CORS errors**: Check that your frontend domain is in the allowed origins
- **Database connection**: Verify database credentials and network access
- **API_BASE not set**: Make sure Cloudflare Pages has the correct API_BASE variable
- **Port issues**: Railway/Render automatically assign ports, so PORT variable might not be needed