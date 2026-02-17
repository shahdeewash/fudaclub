# FÜDA Corporate Lunch Deal - User Guide

## Overview

The FÜDA Corporate Lunch Deal is a subscription-based meal ordering platform designed for office workers. It enables companies to provide daily lunch credits to their employees while incentivizing group orders through free delivery when five or more colleagues order together.

---

## Features

### For Customers

**Subscription Benefits**
- **$25/fortnight** flat subscription fee
- **First meal free daily** (valued at $18)
- **Free delivery** when 5+ colleagues from your company order
- **Real-time colleague tracking** to see who's ordering
- **Order before 10:30 AM** for same-day delivery

**How It Works**
1. Sign up with your work email (e.g., john@apple.com)
2. System automatically detects your company from email domain
3. Subscribe for $25/fortnight
4. Browse menu and order daily
5. First item shows as $0.00 (daily credit)
6. Additional items charged at full price

**Delivery Rules**
- **5+ orders from same company** = Free delivery for everyone
- **Fewer than 5 orders** = Store pickup only
- **After 10:30 AM** = Store pickup only (cutoff enforced)

---

### For Administrators

**Admin Dashboard** (`/admin`)
- View all orders grouped by company
- Track daily statistics (orders, revenue, deliveries)
- Manage Today's Special
- Monitor delivery eligibility by company

**Today's Special Management**
- Select any menu item to feature as daily special
- Highlighted prominently on customer menu
- Can be changed daily

---

### For Kitchen Staff

**Kitchen Display System** (`/kitchen`)
- Kanban board workflow: Pending → Preparing → Ready
- Batch tags showing company grouping (e.g., "BATCH: COMPANY-1")
- Delivery vs. pickup indicators
- Real-time order updates
- One-click status changes

---

## User Flows

### Customer Journey

**1. Registration & Subscription**
```
/subscribe → Enter work email → Company auto-detected → Confirm subscription → Payment ($25)
```

**2. Daily Ordering**
```
/menu → Browse items → See colleague list → Add to cart → First item $0.00 → Checkout
```

**3. Viewing Orders**
```
/orders → See order history → Track status → View delivery/pickup details
```

### Admin Journey

**1. Monitoring Orders**
```
/admin → Overview tab → See stats (orders, companies, revenue, deliveries)
```

**2. Company Grouping**
```
/admin → Companies tab → View orders by company → Check delivery eligibility
```

**3. Managing Specials**
```
/admin → Specials tab → Select menu item → Set as Today's Special
```

### Kitchen Journey

**1. Receiving Orders**
```
/kitchen → Orders appear in "Pending" column → Auto-refresh every 5 seconds
```

**2. Processing Orders**
```
Click "Mark as Preparing" → Order moves to "Preparing" column → Click "Mark as Ready" → Order moves to "Ready"
```

**3. Batch Preparation**
```
Filter by company batch tags → Prepare orders from same company together → Efficient delivery grouping
```

---

## Key Concepts

### Company Detection

The system automatically extracts company information from email domains:

| Email | Detected Company | Domain |
|-------|------------------|--------|
| john@apple.com | Apple | apple.com |
| sarah@google.com | Google | google.com |
| mike@acme.com.au | Acme | acme.com.au |

### Daily Credit System

**How It Works:**
- Each subscriber gets **one free meal per day**
- First item in cart shows as **$0.00**
- Subsequent items show **full price**
- Credit resets daily at midnight

**Example:**
```
Cart:
1. Chicken Kebab Wrap → $0.00 (daily credit)
2. Bubble Tea → $8.00 (full price)
Total: $8.00
```

### Delivery Eligibility

**Free Delivery Threshold:** 5+ orders from same company

**Calculation:**
- System counts orders placed today from your company
- Progress bar shows: "3/5 orders for free delivery"
- When threshold reached: "Free Delivery Unlocked! 🎉"

**Example Scenario:**
```
Company: Apple Inc.
Orders today: 4

User places order:
- If before 10:30 AM → Delivery eligible, but not free (need 1 more)
- If 5th order placed → All 5 orders get free delivery
- If after 10:30 AM → Store pickup only
```

### 10:30 AM Cutoff

**Rules:**
- Orders placed **before 10:30 AM** → Eligible for delivery
- Orders placed **after 10:30 AM** → Store pickup only
- Cutoff enforced automatically by system

**Rationale:**
- Allows kitchen time to prepare lunch orders
- Ensures timely delivery for lunch hour

---

## Technical Details

### Database Schema

**7 Main Tables:**
1. `users` - User accounts with authentication
2. `companies` - Company information and delivery thresholds
3. `subscriptions` - User subscriptions ($25/fortnight)
4. `menuItems` - Food items with prices and categories
5. `orders` - Order records with status and fulfillment type
6. `orderItems` - Individual items within orders
7. `dailyCredits` - Tracks daily credit usage per user

### API Endpoints (tRPC)

**Company:**
- `company.detectFromEmail` - Auto-detect company from email
- `company.getById` - Retrieve company details

**Subscription:**
- `subscription.create` - Create new subscription
- `subscription.getMine` - Get current user's subscription

**Menu:**
- `menu.getAll` - List all menu items
- `menu.getTodaysSpecial` - Get featured special
- `menu.setTodaysSpecial` - Set special (admin only)

**Orders:**
- `order.create` - Create new order
- `order.getMyOrders` - Get user's order history
- `order.getTodayOrders` - Get all today's orders (admin/kitchen)
- `order.updateStatus` - Update order status (admin/kitchen)
- `order.getColleaguesWhoOrdered` - Get list of colleagues who ordered today

**Stats:**
- `stats.getToday` - Get today's statistics
- `stats.getOrdersByCompany` - Get orders grouped by company

---

## Setup Instructions

### Prerequisites

- **Node.js 22+** installed
- **pnpm** package manager
- **Database** (MySQL/TiDB) connection string

### Local Development

**1. Install Dependencies**
```bash
cd fuda-corporate-lunch
pnpm install
```

**2. Set Environment Variables**
```bash
# Database connection
DATABASE_URL="mysql://user:password@host:port/database"

# Authentication (provided by Manus platform)
JWT_SECRET="..."
OAUTH_SERVER_URL="..."
VITE_OAUTH_PORTAL_URL="..."
```

**3. Run Database Migrations**
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

**4. Seed Menu Items**
```sql
-- Run the INSERT statements from the seed script
-- 8 menu items across 4 categories (Kebab, Momo, Bubble Tea, Coffee)
```

**5. Start Development Server**
```bash
pnpm dev
```

**6. Access Application**
- **Frontend:** http://localhost:3000
- **Landing Page:** /
- **Menu:** /menu
- **Admin:** /admin
- **Kitchen:** /kitchen

---

## Deployment Guide

### Option 1: Manus Platform (Recommended)

**Advantages:**
- Built-in hosting and database
- Automatic SSL certificates
- One-click deployment
- Custom domain support

**Steps:**
1. Save checkpoint in Manus interface
2. Click "Publish" button
3. Application deployed to `https://your-app.manus.space`

### Option 2: DigitalOcean

**Cost:** ~$60/month

**Components:**
- Droplet (4GB RAM, 2 CPU) - $24/month
- Managed PostgreSQL - $15/month
- Managed Redis - $10/month
- Spaces (Object Storage) - $5/month
- Backups - $5/month

**Deployment:**
```bash
# Build application
pnpm build

# Start production server
NODE_ENV=production pnpm start
```

### Option 3: Heroku

**Cost:** ~$50/month

**Add-ons:**
- Heroku Postgres (Standard 0) - $50/month
- Heroku Redis (Premium 0) - $15/month

**Deployment:**
```bash
# Create Heroku app
heroku create fuda-corporate-lunch

# Add database
heroku addons:create heroku-postgresql:standard-0

# Deploy
git push heroku main
```

---

## Troubleshooting

### Common Issues

**Issue: "Subscription Required" error**
- **Cause:** User not subscribed
- **Solution:** Navigate to `/subscribe` and complete subscription

**Issue: "Access Denied" on admin/kitchen pages**
- **Cause:** User role is not "admin"
- **Solution:** Update user role in database:
  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'your-email@company.com';
  ```

**Issue: Orders not showing in kitchen display**
- **Cause:** Auto-refresh may be paused
- **Solution:** Refresh page manually or wait 5 seconds for auto-refresh

**Issue: Daily credit not applied**
- **Cause:** Credit already used today
- **Solution:** Daily credits reset at midnight; wait until next day

**Issue: Free delivery not unlocked despite 5+ orders**
- **Cause:** Orders from different companies
- **Solution:** Verify all orders are from same company domain

---

## Next Steps

### For MVP Launch

1. **Test with real users** (10-20 beta testers)
2. **Integrate real Stripe** for payment processing
3. **Integrate real Square API** for menu sync and KDS push
4. **Add SMS notifications** via Twilio
5. **Implement real-time WebSocket** for live updates

### Future Enhancements

- **Mobile app** (iOS/Android)
- **Dietary preferences** (vegetarian, halal, allergies)
- **Order scheduling** (order today for tomorrow)
- **Corporate billing** (company pays for all employees)
- **Delivery radius** management
- **Analytics dashboard** (trends, popular items)
- **Loyalty program** (points, rewards)

---

## Support

For questions or issues:
- **Documentation:** This guide
- **Technical Specs:** `/home/ubuntu/technical_specifications.md`
- **Integration Guide:** `/home/ubuntu/integration_guide_v2.md`
- **Hosting Strategy:** `/home/ubuntu/hosting_strategy.md`

---

**Version:** 1.0.0 (MVP)  
**Last Updated:** February 17, 2026  
**Built with:** React 19, tRPC 11, Drizzle ORM, TailwindCSS 4
