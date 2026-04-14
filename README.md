# My Errand App

My Errand App is a marketplace-style service platform for booking, managing, and paying for errands. It supports three main user roles: clients, delivery agents, and administrators. Clients can request errands and pay via PayPal or wallet funds, agents can accept errands and receive payouts, and admins can verify agents and monitor payments.

## What this app does

- Client registration and login
- Delivery agent registration and login
- Admin dashboard for agent verification and payment history
- Create and manage errands with pickup/dropoff details
- Accept errands for delivery agents
- Payment processing via PayPal and Stripe-powered wallet deposits
- Escrow-style wallet flow: client spendable balance → escrow → runner withdrawable balance
- Real-time communication using Socket.IO
- Internationalization support using `react-i18next`

## Architecture

- `server.js` — entry point for the backend API and Socket.IO server
- `routes/` — Express API routes for clients, agents, payments, admin, and errands
- `config/` — database connectivity for MySQL and MongoDB
- `utils/` — wallet and payment helper utilities
- `client/` — React frontend application powered by Webpack
- `scripts/` — database setup scripts

## Tech stack

- Backend: Node.js, Express, MySQL, MongoDB, JWT, Socket.IO
- Frontend: React, Webpack, `react-i18next`, Axios
- Payments: PayPal, Stripe
- Security: bcrypt, helmet, express-rate-limit, express-validator

## Installation

1. Clone the repo:

   ```bash
   git clone https://github.com/Todyents/my-errand-app.git
   cd my-errand-app
   ```

2. Install root dependencies:

   ```bash
   npm install
   ```

3. Install client dependencies:

   ```bash
   npm run install-client
   ```

4. Create environment variables. Example `.env`:

   ```env
   PORT=5000
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=your_mysql_password
   MYSQL_DATABASE=errandsplace
   JWT_SECRET=your_jwt_secret
   STRIPE_SECRET=your_stripe_secret_key
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_SECRET=your_paypal_secret
   ```

5. Prepare your database schema. Use the SQL files in `database/` and the scripts in `scripts/` as needed.

## Running the app

### Development

```bash
npm run dev
```

This runs the backend and client concurrently:
- backend on `http://localhost:5000`
- client on `http://localhost:3001`

### Production build for client

```bash
npm run build
npm run build:prod
```

## Available scripts

- `npm start` — starts the backend server only
- `npm run dev` — starts both backend and frontend concurrently
- `npm run server` — starts backend with `nodemon`
- `npm run client` — starts the frontend dev server
- `npm run build` — builds the frontend production bundle
- `npm run build:prod` — builds the frontend and starts the backend
- `npm run install-client` — installs dependencies for the React client
- `npm run setup-db` — runs database setup script

## API highlights

### Client routes
- `POST /api/clients/register` — register a new client
- `POST /api/clients/login` — client login

### Agent routes
- `POST /api/agents/register` — register a delivery agent
- `POST /api/agents/login` — agent login

### Payment routes
- `POST /api/payments/create-payment-intent` — create a Stripe payment intent
- `POST /api/payments/capture-order/:orderId` — capture a PayPal order and confirm an errand
- `POST /api/payments/deposit` — deposit funds into a wallet
- `POST /api/payments/withdraw` — withdraw funds from a wallet
- `GET /api/admin/payments` — admin payment history

## Frontend

The React client lives in `client/`. It uses:

- `webpack` for bundling
- `react-router-dom` for routes
- `axios` for API requests
- `react-i18next` for localization

## Notes

- The backend assumes a MySQL database schema with clients, delivery agents, errands, wallets, and transactions.
- PayPal is configured for sandbox mode by default in the payment route.
- Wallets are structured with `spendable`, `escrow`, and `withdrawable` balances.
- There is also a `server/` folder in the repository that appears to contain additional backend scaffolding; the main app entrypoint is at the repository root.

## Recommended next steps

- Add a proper `.env.example` file to make setup easier
- Complete database migration scripts and example data
- Add a production-ready PayPal environment config
- Add validation and auth middleware to all payment and wallet endpoints

## Contact

If you want help expanding the app, I can also document the exact client/agent/admin user flows and the important database tables.