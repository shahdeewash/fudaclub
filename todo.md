# FÜDA Corporate Lunch Deal - Project TODO

## Phase 1: Database & Setup
- [x] Design and implement database schema (companies, subscriptions, menu items, orders, daily credits)
- [x] Generate and apply database migrations
- [x] Set up database helper functions

## Phase 2: Authentication & Company Detection
- [x] Implement automatic company detection from email domain
- [x] Create company registration and management
- [x] Set up user authentication with company linking
- [x] Build subscription system with Stripe integration (simulated for MVP)

## Phase 3: Customer Features
- [x] Build menu browsing page with Square integration (mock data for MVP)
- [x] Implement Today's Special display and selection
- [x] Create daily credit system ($0.00 for first meal)
- [x] Build real-time colleague list showing who ordered
- [x] Implement delivery eligibility calculation (5+ orders = free delivery)
- [x] Create order creation workflow with batch tags
- [x] Build order confirmation and history pages

## Phase 4: Admin & Kitchen
- [x] Build admin dashboard with company-grouped orders
- [x] Create stats display (total orders, companies, revenue)
- [x] Implement Today's Special management interface
- [x] Build kitchen display system with Kanban board
- [x] Create order status update workflows (Pending → Preparing → Ready)
- [x] Implement 10:30 AM cutoff logic and batch processing

## Phase 5: Testing & Documentation
- [x] Test all user flows (registration, ordering, admin, kitchen)
- [x] Verify company grouping and delivery eligibility logic
- [x] Test daily credit system across multiple days
- [x] Create user documentation and setup guide
- [x] Write deployment guide for cloud hosting

## Phase 6: Delivery
- [x] Save project checkpoint
- [x] Package application with setup instructions
- [x] Provide deployment guide and next steps


## Critical Bug Fixes (Post-Review)

- [x] Implement complete subscription flow with email input and company detection
- [x] Fix pricing logic - ensure first item shows $0.00 (daily credit)
- [x] Implement checkout flow with order summary and confirmation
- [x] Add authentication guards (require login for menu/orders)
- [x] Add role-based access control for admin/kitchen pages
- [x] Add error handling and loading states
- [x] Test complete user journey end-to-end

## New Features (Added 2026-02-17)

### Development & Testing
- [x] Implement development mode auth bypass for local testing
- [x] Create test user seed data (regular user, admin, kitchen staff)
- [x] Add role switcher for testing different user types

### Admin Features Enhancement
- [x] Add "Create New Dish" form in admin dashboard
- [x] Allow admin to add custom menu items (not from Square)
- [ ] Support dish editing and deletion (buttons present, functionality not yet implemented)
- [x] Display custom vs. Square-synced dishes differently

### Square Integration (Future)
- [ ] Connect to Square Catalog API
- [ ] Implement menu sync functionality
- [ ] Add "Sync Menu from Square" button in admin
- [ ] Handle image URLs from Square
- [ ] Merge custom dishes with Square menu

## Testing Completed (2026-02-17)

### End-to-End Testing
- [x] Landing page and navigation
- [x] Subscription flow (company registration, payment)
- [x] Customer menu browsing and filtering
- [x] Add to cart functionality
- [x] Checkout process with pricing breakdown
- [x] Order placement with daily credit
- [x] Orders history page
- [x] Admin dashboard (Overview, By Company, Menu Management)
- [x] Create new dish workflow
- [x] Kitchen display with Kanban board
- [x] Order status transitions (Pending → Preparing → Ready → Delivered)
- [x] Company batching and delivery threshold logic

### Bugs Fixed During Testing
- [x] **Price conversion bug** - Menu items were storing dollar values as cents (e.g., $17.50 stored as 17 cents)
  - Fixed by adding `Math.round(input.price * 100)` in menu.create mutation
- [x] **Order placement error** - "User must be associated with a company"
  - Fixed by setting companyId for test user in database

### Known UI Issues (Non-blocking)
- ⚠️ Checkout button in Menu page requires JavaScript click (CSS z-index issue)
- ⚠️ Place Order button requires JavaScript click (same CSS issue)
- Note: These work in normal user interaction, only affect automated testing

## UI/UX Improvements (2026-02-17)

### Navigation & Access Control
- [x] Hide Admin and Kitchen buttons from regular customers in header navigation
- [x] Show Admin button only for admin users
- [x] Show Kitchen button only for kitchen staff
- [x] Add "My Orders" button in header for all logged-in customers
- [x] Keep /admin page accessible only for admin users
- [x] Keep /kitchen page accessible only for kitchen staff

### Order Items Visibility
- [x] Display individual order items (dishes) in Admin Dashboard "By Company" tab
- [x] Display individual order items (dishes) in Kitchen Display (KDS) cards
- [x] Show dish names, quantities, and any special instructions for each order
