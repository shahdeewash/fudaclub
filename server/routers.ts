import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { devRouter } from "./dev-routers";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { nanoid } from "nanoid";
import { notifyOwner } from "./_core/notification";
import { getOrCreateSubscriptionPriceId, getOrCreatePriceId, SUBSCRIPTION_PLANS } from "./products";
import {
  buildSquareAuthUrl,
  getSquareConnection,
  deleteSquareConnection,
  syncSquareCatalog,
  getMenuItemModifiers,
} from "./square";

// Helper to extract domain from email
function extractDomain(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) throw new Error("Invalid email format");
  
  let domain = parts[1]!.toLowerCase();
  // Remove country TLDs (.au, .uk, etc.)
  domain = domain.replace(/\.(au|uk|nz|ca)$/, '');
  
  return domain;
}

// Helper to capitalize company name from domain
function capitalizeCompanyName(domain: string): string {
  const name = domain.split('.')[0]!;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const appRouter = router({
  system: systemRouter,
  dev: devRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  company: router({
    detectFromEmail: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        try {
          const domain = extractDomain(input.email);
          let company = await db.getCompanyByDomain(domain);
          
          if (!company) {
            // Auto-create company
            company = await db.createCompany({
              name: capitalizeCompanyName(domain),
              domain,
              deliveryThreshold: 5,
              isActive: true,
            });
          }

          // Count colleagues
          const colleagues = await db.getUsersByCompanyId(company.id);
          
          return {
            company,
            colleagueCount: colleagues.length,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid email format',
          });
        }
      }),

    getAll: protectedProcedure.query(async () => {
      return await db.getAllCompanies();
    }),
  }),

  subscription: router({
    /**
     * Returns the current user's active subscription (or null).
     */
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const sub = await db.getActiveSubscriptionByUserId(ctx.user.id);
      if (!sub) return null;
      return {
        id: sub.id,
        status: sub.status,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: (sub as any).cancelAtPeriodEnd ?? false,
        hasStripeCustomer: !!(sub as any).stripeCustomerId && !(sub as any).stripeCustomerId.startsWith('sim_'),
        planType: (sub as any).planType ?? "fortnightly",
        planAmount: sub.planAmount,
      };
    }),

    /**
     * Creates a Stripe Checkout session for a subscription (fortnightly or monthly).
     * Returns the Stripe-hosted checkout URL; the frontend opens it in a new tab.
     */
    createCheckout: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        origin: z.string(),
        planType: z.enum(["fortnightly", "monthly"]).default("fortnightly"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user already has active subscription
        const existing = await db.getActiveSubscriptionByUserId(ctx.user.id);
        if (existing && existing.status === 'active') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User already has an active subscription',
          });
        }

        const priceId = await getOrCreatePriceId(input.planType);
        const plan = SUBSCRIPTION_PLANS[input.planType];
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        const sessionParams: any = {
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          customer_email: ctx.user.email,
          client_reference_id: ctx.user.id.toString(),
          metadata: {
            user_id: ctx.user.id.toString(),
            company_id: input.companyId.toString(),
            customer_email: ctx.user.email,
            customer_name: ctx.user.name ?? "",
            plan_type: input.planType,
            plan_amount: plan.amount.toString(),
          },
          success_url: `${input.origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.origin}/subscribe`,
          allow_promotion_codes: true,
        };
        const session = await stripe.checkout.sessions.create(sessionParams);

        return { checkoutUrl: (session as any).url ?? "" };
      }),

    getMine: protectedProcedure.query(async ({ ctx }) => {
      return await db.getActiveSubscriptionByUserId(ctx.user.id);
    }),

    /**
     * Activates a subscription after Stripe Checkout completes.
     * Called from the SubscriptionSuccess page with the Stripe session ID.
     */
    activateFromSession: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
          expand: ["subscription"],
        }) as any;

        if (session.payment_status !== "paid" && session.status !== "complete") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Payment not completed" });
        }

        const stripeSubscription = session.subscription as any;
        const companyId = session.metadata?.company_id ? parseInt(session.metadata.company_id) : null;

        // Check if subscription already activated (idempotency)
        const existing = await db.getActiveSubscriptionByUserId(ctx.user.id);
        if (existing && existing.stripeSubscriptionId === stripeSubscription?.id) {
          return existing;
        }

        const now = new Date();
        const periodStart = stripeSubscription?.current_period_start
          ? new Date(stripeSubscription.current_period_start * 1000)
          : now;
        const periodEnd = stripeSubscription?.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000)
          : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        const planType = (session.metadata?.plan_type === "monthly" ? "monthly" : "fortnightly") as "fortnightly" | "monthly";
        const planAmount = session.metadata?.plan_amount ? parseInt(session.metadata.plan_amount) : SUBSCRIPTION_PLANS[planType].amount;

        const sub = await db.createSubscription({
          userId: ctx.user.id,
          stripeSubscriptionId: stripeSubscription?.id ?? input.sessionId,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
          status: "active",
          planAmount,
          planType,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        });

        // Link user to company if provided
        if (companyId) {
          const dbInstance = await db.getDb();
          if (dbInstance) {
            const { users } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await dbInstance.update(users).set({ companyId }).where(eq(users.id, ctx.user.id));
          }
        }

        await notifyOwner({
          title: `New Subscription: ${ctx.user.name ?? ctx.user.email}`,
          content: `User ${ctx.user.email} subscribed.\nStripe subscription: ${stripeSubscription?.id ?? "N/A"}\nPeriod: ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
        }).catch(() => {});

        return sub;
      }),

    /**
     * Cancel the current subscription at period end.
     */
    cancel: protectedProcedure.mutation(async ({ ctx }) => {
      const sub = await db.getActiveSubscriptionByUserId(ctx.user.id);
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription' });

      if (sub.stripeSubscriptionId && !sub.stripeSubscriptionId.startsWith('sim_')) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
        await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      }

      const dbInstance = await db.getDb();
      if (dbInstance) {
        const { subscriptions } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await dbInstance.update(subscriptions)
          .set({ cancelAtPeriodEnd: true })
          .where(eq(subscriptions.id, sub.id));
      }

      return { success: true };
    }),

    /**
     * Create a Stripe Billing Portal session and return the URL.
     * Requires the user to have a Stripe customer ID stored on their subscription.
     */
    getPortalUrl: protectedProcedure
      .input(z.object({ returnUrl: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        const sub = await db.getActiveSubscriptionByUserId(ctx.user.id);
        if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found.' });

        const customerId = (sub as any).stripeCustomerId;
        if (!customerId || customerId.startsWith('sim_')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No Stripe customer linked to this subscription. Please contact support.',
          });
        }

        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: input.returnUrl,
        });

        return { portalUrl: session.url };
      }),
  }),

  menu: router({
    getAll: publicProcedure.query(async () => {
      return await db.getAllMenuItems();
    }),

    /** Returns modifier lists (with options) for a given menu item */
    getModifiers: publicProcedure
      .input(z.object({ menuItemId: z.number() }))
      .query(async ({ input }) => {
        return await getMenuItemModifiers(input.menuItemId);
      }),

    getAllAdmin: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return await db.getAllMenuItemsAdmin();
    }),

    getTodaysSpecial: publicProcedure.query(async () => {
      return (await db.getTodaysSpecial()) ?? null;
    }),

    setTodaysSpecial: protectedProcedure
      .input(z.object({ menuItemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        await db.setTodaysSpecial(input.menuItemId);
        return { success: true };
      }),

    updateImage: protectedProcedure
      .input(z.object({
        menuItemId: z.number(),
        imageUrl: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.updateMenuItemImage(input.menuItemId, input.imageUrl);
        return { success: true };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        price: z.number(),
        imageUrl: z.string().optional(),
        setAsSpecial: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Convert price from dollars to cents
        const priceInCents = Math.round(input.price * 100);

        const newItem = await db.createMenuItem({
          name: input.name,
          description: input.description,
          category: input.category,
          price: priceInCents,
          imageUrl: input.imageUrl,
          isAvailable: true,
          isTodaysSpecial: false,
        });

        // Optionally set as today's special
        if (input.setAsSpecial) {
          await db.setTodaysSpecial(newItem.id);
        }

        return newItem;
      }),

    update: protectedProcedure
      .input(z.object({
        menuItemId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        price: z.number().optional(),
        imageUrl: z.string().optional(),
        isAvailable: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { menuItemId, price, ...rest } = input;
        const updates: Record<string, unknown> = { ...rest };
        if (price !== undefined) {
          updates.price = Math.round(price * 100);
        }
        await db.updateMenuItem(menuItemId, updates as Parameters<typeof db.updateMenuItem>[1]);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ menuItemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.deleteMenuItem(input.menuItemId);
        return { success: true };
      }),

    renameCategory: protectedProcedure
      .input(z.object({ oldName: z.string(), newName: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.renameCategory(input.oldName, input.newName);
        return { success: true };
      }),

    deleteCategory: protectedProcedure
      .input(z.object({ category: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.deleteCategoryItems(input.category);
        return { success: true };
      }),

    bulkUpdateCategoryPrice: protectedProcedure
      .input(z.object({
        category: z.string(),
        price: z.number().min(0), // in dollars
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const priceInCents = Math.round(input.price * 100);
        await db.bulkUpdateCategoryPrice(input.category, priceInCents);
        return { success: true };
      }),

    reorderItems: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          id: z.number(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.reorderMenuItems(input.items);
        return { success: true };
      }),

    toggleAvailability: protectedProcedure
      .input(z.object({
        id: z.number(),
        isAvailable: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.toggleMenuItemAvailability(input.id, input.isAvailable);
        return { success: true };
      }),
  }),

  order: router({
    create: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          menuItemId: z.number(),
          quantity: z.number().min(1),
          modifierNote: z.string().optional(),
        })),
        specialInstructions: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check subscription
        const subscription = await db.getActiveSubscriptionByUserId(ctx.user.id);
        if (!subscription) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Active subscription required',
          });
        }

        if (!ctx.user.companyId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User must be associated with a company',
          });
        }

        // Check 10:30 AM Darwin time cutoff (affects fulfillment type)
        const nowUtc = new Date();
        const darwinOffsetMs = 9.5 * 60 * 60 * 1000;
        const darwinNow = new Date(nowUtc.getTime() + darwinOffsetMs);
        const darwinHour = darwinNow.getUTCHours();
        const darwinMinute = darwinNow.getUTCMinutes();
        const isPastCutoff = darwinHour > 10 || (darwinHour === 10 && darwinMinute >= 30);

        // Check daily credit
        let dailyCredit = await db.getDailyCreditForToday(ctx.user.id);
        if (!dailyCredit) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dailyCredit = await db.createDailyCredit({
            userId: ctx.user.id,
            creditDate: today,
            isUsed: false,
          });
        }

        const canUseCredit = !dailyCredit.isUsed;

        // Get menu items
        const menuItemsData = await db.getAllMenuItems();
        const menuItemMap = new Map(menuItemsData.map(item => [item.id, item]));

        // Calculate totals and split items for daily credit
        let subtotal = 0;
        let creditApplied = false;
        const orderItemsData: Array<{
          menuItemId: number;
          itemName: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
          isFree: boolean;
          modifierNote?: string;
        }> = [];


        for (const item of input.items) {

          const menuItem = menuItemMap.get(item.menuItemId);
          if (!menuItem) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Menu item ${item.menuItemId} not found`,
            });
          }

          // If daily credit available and not yet applied, split first unit as free
          if (canUseCredit && !creditApplied && item.quantity > 0) {

            // First unit is free
            orderItemsData.push({
              menuItemId: item.menuItemId,
              itemName: menuItem.name,
              quantity: 1,
              unitPrice: 0, // Free!
              totalPrice: 0,
              isFree: true,
              modifierNote: item.modifierNote,
            });
            creditApplied = true;

            // Remaining units at full price
            if (item.quantity > 1) {
              const remainingQty = item.quantity - 1;
              const remainingTotal = menuItem.price * remainingQty;
              orderItemsData.push({
                menuItemId: item.menuItemId,
                itemName: menuItem.name,
                quantity: remainingQty,
                unitPrice: menuItem.price,
                totalPrice: remainingTotal,
                isFree: false,
                modifierNote: item.modifierNote,
              });
              subtotal += remainingTotal;

            }
          } else {

            // No credit or already applied - full price
            const totalPrice = menuItem.price * item.quantity;
            orderItemsData.push({
              menuItemId: item.menuItemId,
              itemName: menuItem.name,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              totalPrice,
              isFree: false,
              modifierNote: item.modifierNote,
            });
            subtotal += totalPrice;

          }
        }



        // Check delivery eligibility
        const companyOrders = await db.getOrdersByCompanyToday(ctx.user.companyId);
        const orderCount = companyOrders.length + 1; // Including this order
        
        const company = await db.getCompanyByDomain(''); // We'll get it properly
        const deliveryThreshold = company?.deliveryThreshold || 5;
        const isFreeDelivery = orderCount >= deliveryThreshold;

        const deliveryFee = isFreeDelivery ? 0 : 800; // $8.00
        const tax = Math.round((subtotal + deliveryFee) * 0.1);
        const total = subtotal + deliveryFee + tax;

        // Create order
        const order = await db.createOrder({
          userId: ctx.user.id,
          companyId: ctx.user.companyId,
          orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
          orderDate: new Date(),
          status: 'pending',
          fulfillmentType: (isFreeDelivery && !isPastCutoff) ? 'delivery' : 'pickup',
          isFreeDelivery,
          dailyCreditUsed: canUseCredit,
          subtotal,
          deliveryFee,
          tax,
          total,
          specialInstructions: input.specialInstructions,
        });

        // Create order items
        for (const item of orderItemsData) {
          await db.createOrderItem({
            orderId: order.id,
            ...item,
          });
        }

        // Mark daily credit as used if applicable
        if (canUseCredit) {
          await db.markDailyCreditAsUsed(dailyCredit.id, order.id);
        }

        // Notify owner of new order
        const freeItemsSummary = orderItemsData
          .map(i => `${i.quantity}x ${i.itemName}${i.isFree ? " (free credit)" : ""}`)
          .join(", ");
        await notifyOwner({
          title: `New Order: ${order.orderNumber}`,
          content: `Customer: ${ctx.user.name ?? ctx.user.email}\nItems: ${freeItemsSummary}\nTotal: $${(total / 100).toFixed(2)} AUD\nPayment: Daily Credit (free)`,
        }).catch(() => {});

        return {
          order,
          items: orderItemsData,
        };
      }),

    getMyOrders: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await db.getDb();
      if (!dbInstance) return [];

      const { orders } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      
      return await dbInstance
        .select()
        .from(orders)
        .where(eq(orders.userId, ctx.user.id))
        .orderBy(desc(orders.createdAt));
    }),

    getTodayOrders: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'kitchen') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const orders = await db.getAllOrdersToday();
      
      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await db.getOrderItemsByOrderId(order.id);
          return { ...order, items };
        })
      );

      return ordersWithItems;
    }),

    getOrderItems: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input }) => {
        return await db.getOrderItemsByOrderId(input.orderId);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        status: z.enum(['pending', 'confirmed', 'arrived', 'preparing', 'ready', 'delivered', 'canceled']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'kitchen') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        await db.updateOrderStatus(input.orderId, input.status);
        return { success: true };
      }),

    getAllOrders: protectedProcedure
      .input(z.object({
        dateFilter: z.enum(['today', 'yesterday', 'week', 'all']).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'kitchen') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const allOrders = await db.getAllOrdersFiltered(input?.dateFilter || 'all');

        // Fetch order items and user info for each order
        const ordersWithDetails = await Promise.all(
          allOrders.map(async (order) => {
            const items = await db.getOrderItemsByOrderId(order.id);
            const user = await db.getUserById(order.userId);
            return { ...order, items, userName: user?.name || user?.email || 'Unknown' };
          })
        );

        return ordersWithDetails;
      }),

    getColleaguesWhoOrdered: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.companyId) return [];

      const orders = await db.getOrdersByCompanyToday(ctx.user.companyId);
      const userIdSet = new Set(orders.map(o => o.userId));
      const userIds = Array.from(userIdSet);
      
      const users = await Promise.all(
        userIds.map(id => db.getUserById(id))
      );

      return users.filter(u => u !== undefined).map(u => ({
        id: u!.id,
        name: u!.name || 'Anonymous',
      }));
    }),

    getDailyCredit: protectedProcedure.query(async ({ ctx }) => {
      const dailyCredit = await db.getDailyCreditForToday(ctx.user.id);
      
      return {
        available: true, // User has subscription, so credit is available
        usedToday: dailyCredit ? dailyCredit.isUsed : false,
        creditDate: dailyCredit?.creditDate || new Date(),
      };
    }),
  }),

  stats: router({
    getToday: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const orders = await db.getAllOrdersToday();
      const companyIds = orders.map(o => o.companyId);
      const companies = new Set(companyIds);
      const freeDeliveries = orders.filter(o => o.isFreeDelivery).length;
      const revenue = orders.reduce((sum: number, o) => sum + o.total, 0);

      return {
        totalOrders: orders.length,
        companiesOrdering: companies.size,
        freeDeliveries,
        revenue,
      };
    }),

    getOrdersByCompany: protectedProcedure
      .input(z.object({
        dateFilter: z.enum(['today', 'yesterday', 'week', 'all']).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const allOrders = await db.getAllOrdersFiltered(input?.dateFilter || 'today');
        const companies = await db.getAllCompanies();
        
        const companyMap = new Map(companies.map(c => [c.id, c]));
        const ordersByCompany = new Map<number, typeof allOrders>();

        // Fetch order items and user info for all orders
        const ordersWithItems = await Promise.all(
          allOrders.map(async (order) => {
            const items = await db.getOrderItemsByOrderId(order.id);
            const user = await db.getUserById(order.userId);
            return { ...order, items, userName: user?.name || user?.email || 'Unknown' };
          })
        );

        for (const order of ordersWithItems) {
          if (!ordersByCompany.has(order.companyId)) {
            ordersByCompany.set(order.companyId, []);
          }
          ordersByCompany.get(order.companyId)!.push(order);
        }

        const result = [];
        const entries = Array.from(ordersByCompany.entries());
        for (const [companyId, companyOrders] of entries) {
          const company = companyMap.get(companyId);
          if (company) {
            result.push({
              company,
              orders: companyOrders,
              orderCount: companyOrders.length,
              totalValue: companyOrders.reduce((sum: number, o) => sum + o.total, 0),
            });
          }
        }
        return result;
      }),

    // Get all orders flat list for admin
    getAllOrdersFlat: protectedProcedure
      .input(z.object({
        dateFilter: z.enum(['today', 'yesterday', 'week', 'all']).optional(),
        groupBy: z.enum(['all', 'company', 'individual']).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const allOrders = await db.getAllOrdersFiltered(input?.dateFilter || 'all');
        const companies = await db.getAllCompanies();
        const companyMap = new Map(companies.map(c => [c.id, c]));

        const ordersWithDetails = await Promise.all(
          allOrders.map(async (order) => {
            const items = await db.getOrderItemsByOrderId(order.id);
            const user = await db.getUserById(order.userId);
            const company = companyMap.get(order.companyId);
            return {
              ...order,
              items,
              userName: user?.name || user?.email || 'Unknown',
              companyName: company?.name || 'Unknown Company',
            };
          })
        );

        return ordersWithDetails;
      }),

    /**
     * Export orders as CSV-ready rows. Admin only.
     * Columns: order_id, created_at (ACST), lane, status, items_count,
     *          subtotal_ex_gst, gst_10pct, total_inc_gst, payment_method,
     *          customer_name, customer_email
     * GST: total_inc_gst = round(subtotal_ex_gst * 1.10, 2)
     *      gst_10pct     = round(subtotal_ex_gst * 0.10, 2)
     */
    exportOrders: protectedProcedure
      .input(z.object({
        dateFilter: z.enum(['today', 'yesterday', 'week', 'all']).optional(),
        status: z.enum(['pending', 'confirmed', 'arrived', 'preparing', 'ready', 'delivered', 'canceled', 'all']).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const allOrders = await db.getAllOrdersFiltered(input?.dateFilter || 'all');
        const filteredOrders = input?.status && input.status !== 'all'
          ? allOrders.filter(o => o.status === input.status)
          : allOrders;

        const rows = await Promise.all(
          filteredOrders.map(async (order) => {
            const items = await db.getOrderItemsByOrderId(order.id);
            const user = await db.getUserById(order.userId);

            // Convert to ACST (Australia/Darwin, UTC+9:30)
            const createdAt = new Date(order.createdAt.getTime() + 9.5 * 60 * 60 * 1000);
            const createdAtStr = createdAt.toISOString().replace('T', ' ').substring(0, 19) + ' ACST';

            // GST calculations (prices stored in cents, export in dollars)
            const subtotalDollars = order.subtotal / 100;
            const subtotalExGst = Math.round(subtotalDollars / 1.1 * 100) / 100;
            const gst10pct = Math.round(subtotalExGst * 0.10 * 100) / 100;
            const totalIncGst = Math.round(subtotalExGst * 1.10 * 100) / 100;

            const paymentMethod = order.stripeSessionId ? 'Stripe' : 'Daily Credit';

            return {
              order_id: order.orderNumber,
              created_at: createdAtStr,
              lane: order.fulfillmentType,
              status: order.status,
              items_count: items.reduce((sum, i) => sum + i.quantity, 0),
              subtotal_ex_gst: subtotalExGst.toFixed(2),
              gst_10pct: gst10pct.toFixed(2),
              total_inc_gst: totalIncGst.toFixed(2),
              payment_method: paymentMethod,
              customer_name: user?.name || 'Unknown',
              customer_email: user?.email || 'Unknown',
            };
          })
        );

        return rows;
      }),

    /**
     * Customer marks themselves as arrived for order pickup.
     * Transitions order status from 'confirmed' → 'arrived'.
     */
    markArrived: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

        const { orders: ordersTable } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        // Verify the order belongs to this user
        const existing = await dbInstance
          .select()
          .from(ordersTable)
          .where(and(eq(ordersTable.id, input.orderId), eq(ordersTable.userId, ctx.user.id)))
          .limit(1);

        if (!existing[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
        if (!['confirmed', 'pending'].includes(existing[0].status)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Order cannot be marked as arrived in its current state' });
        }

        await dbInstance
          .update(ordersTable)
          .set({ status: 'arrived' })
          .where(eq(ordersTable.id, input.orderId));

        // Notify kitchen/owner
        await notifyOwner({
          title: `Customer Arrived: ${existing[0].orderNumber}`,
          content: `Order ${existing[0].orderNumber} — customer has arrived and is ready for pickup.`,
        }).catch(() => {});

        return { success: true, orderNumber: existing[0].orderNumber };
      }),

    /**
     * Sends owner notifications for subscriptions expiring within 3 days.
     * Should be triggered daily (e.g., via a scheduled job or admin action).
     * Admin-only.
     */
    sendExpiryReminders: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const expiring = await db.getSubscriptionsExpiringWithin(3);
      if (expiring.length === 0) {
        return { sent: 0, message: 'No subscriptions expiring in the next 3 days.' };
      }

      let sent = 0;
      for (const sub of expiring) {
        const planLabel = (sub as any).planType === 'monthly' ? 'Monthly ($500)' : 'Fortnightly ($270)';
        const expiryDate = new Date(sub.currentPeriodEnd).toLocaleDateString('en-AU', {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        await notifyOwner({
          title: `Subscription Expiring Soon: ${sub.userName ?? sub.userEmail ?? 'Unknown'}`,
          content: `Plan: ${planLabel}\nCustomer: ${sub.userName ?? 'N/A'} (${sub.userEmail ?? 'N/A'})\nExpires: ${expiryDate}\nStripe ID: ${sub.stripeSubscriptionId ?? 'N/A'}`,
        }).catch(() => {});
        sent++;
      }

      return { sent, message: `Sent ${sent} expiry reminder${sent !== 1 ? 's' : ''}.` };
    }),
  }),

  // Stripe Payment
  payment: router({
    createCheckoutSession: protectedProcedure
      .input(z.object({
        cartItems: z.array(z.object({
          name: z.string(),
          price: z.number(), // in cents
          quantity: z.number(),
          imageUrl: z.string().optional(),
        })),
        totalAmount: z.number(), // in cents
        origin: z.string(),
        orderData: z.object({
          items: z.array(z.object({
            menuItemId: z.number(),
            quantity: z.number(),
            price: z.number(),
          })),
          deliveryFee: z.number(),
          tax: z.number(),
          dailyCreditApplied: z.boolean(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        // Build line items from cart
        const lineItems = input.cartItems.map(item => ({
          price_data: {
            currency: "aud",
            product_data: {
              name: item.name,
              ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
            },
            unit_amount: item.price, // already in cents
          },
          quantity: item.quantity,
        }));

        // Add delivery fee as separate line item if applicable
        if (input.orderData.deliveryFee > 0) {
          lineItems.push({
            price_data: {
              currency: "aud",
              product_data: { name: "Delivery Fee" },
              unit_amount: input.orderData.deliveryFee,
            },
            quantity: 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          line_items: lineItems,
          mode: "payment",
          customer_email: ctx.user.email ?? undefined,
          client_reference_id: ctx.user.id.toString(),
          metadata: {
            user_id: ctx.user.id.toString(),
            customer_email: ctx.user.email ?? "",
            customer_name: ctx.user.name ?? "",
            order_data: JSON.stringify(input.orderData),
          },
          success_url: `${input.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.origin}/checkout`,
          allow_promotion_codes: true,
        });

        return { url: session.url, sessionId: session.id };
      }),

    verifyAndCreateOrder: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        // Retrieve the checkout session from Stripe
        const session = await stripe.checkout.sessions.retrieve(input.sessionId);

        if (session.payment_status !== "paid") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Payment not completed",
          });
        }

        // Verify the session belongs to this user
        if (session.client_reference_id !== ctx.user.id.toString()) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Session does not belong to this user",
          });
        }

        // Parse order data from metadata
        const orderDataStr = session.metadata?.order_data;
        if (!orderDataStr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order data not found in session",
          });
        }

        const orderData = JSON.parse(orderDataStr) as {
          items: Array<{ menuItemId: number; quantity: number; price: number }>;
          deliveryFee: number;
          tax: number;
          dailyCreditApplied: boolean;
          specialInstructions?: string;
        };

        const { items, specialInstructions } = orderData;
        
        if (!ctx.user.companyId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User must be associated with a company",
          });
        }

        // Get menu items
        const menuItemsData = await db.getAllMenuItems();
        const menuItemMap = new Map(menuItemsData.map(item => [item.id, item]));

        // Check daily credit
        let dailyCreditRecord = await db.getDailyCreditForToday(ctx.user.id);
        if (!dailyCreditRecord) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dailyCreditRecord = await db.createDailyCredit({
            userId: ctx.user.id,
            creditDate: today,
            isUsed: false,
          });
        }
        const canUseCredit = !dailyCreditRecord.isUsed;

        // Build order items
        const orderItemsData: Array<{
          menuItemId: number;
          itemName: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
          isFree: boolean;
          modifierNote?: string;
        }> = [];

        let subtotal = 0;
        let creditApplied = false;

        for (const item of items) {
          const menuItem = menuItemMap.get(item.menuItemId);
          if (!menuItem) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Menu item ${item.menuItemId} not found`,
            });
          }

          if (canUseCredit && !creditApplied && item.quantity > 0) {
            creditApplied = true;
            orderItemsData.push({
              menuItemId: item.menuItemId,
              itemName: menuItem.name,
              quantity: 1,
              unitPrice: 0,
              totalPrice: 0,
              isFree: true,
            });
            if (item.quantity > 1) {
              const remainingQty = item.quantity - 1;
              const remainingTotal = menuItem.price * remainingQty;
              orderItemsData.push({
                menuItemId: item.menuItemId,
                itemName: menuItem.name,
                quantity: remainingQty,
                unitPrice: menuItem.price,
                totalPrice: remainingTotal,
                isFree: false,
              });
              subtotal += remainingTotal;
            }
          } else {
            const totalPrice = menuItem.price * item.quantity;
            orderItemsData.push({
              menuItemId: item.menuItemId,
              itemName: menuItem.name,
              quantity: item.quantity,
              unitPrice: menuItem.price,
              totalPrice,
              isFree: false,
            });
            subtotal += totalPrice;
          }
        }

        const companyOrders = await db.getOrdersByCompanyToday(ctx.user.companyId);
        const isFreeDelivery = (companyOrders.length + 1) >= 5;
        const deliveryFee = isFreeDelivery ? 0 : 800;
        const tax = Math.round((subtotal + deliveryFee) * 0.1);
        const total = subtotal + deliveryFee + tax;

        const order = await db.createOrder({
          userId: ctx.user.id,
          companyId: ctx.user.companyId,
          orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
          orderDate: new Date(),
          status: "confirmed",
          fulfillmentType: isFreeDelivery ? "delivery" : "pickup",
          isFreeDelivery,
          dailyCreditUsed: canUseCredit,
          subtotal,
          deliveryFee,
          tax,
          total,
          specialInstructions: specialInstructions || undefined,
          stripeSessionId: input.sessionId,
        });

        // Create order items
        for (const item of orderItemsData) {
          await db.createOrderItem({
            orderId: order.id,
            ...item,
          });
        }

        // Mark daily credit as used if applicable
        if (canUseCredit) {
          await db.markDailyCreditAsUsed(dailyCreditRecord.id, order.id);
        }

        // Notify owner of new paid order
        const itemsSummary = orderItemsData
          .map(i => `${i.quantity}x ${i.itemName}${i.isFree ? " (free credit)" : ""}`)
          .join(", ");
        await notifyOwner({
          title: `New Paid Order: ${order.orderNumber}`,
          content: `Customer: ${ctx.user.name ?? ctx.user.email}\nItems: ${itemsSummary}\nTotal: $${(total / 100).toFixed(2)} AUD\nPayment: Stripe (${input.sessionId})`,
        }).catch(() => {});

        return { order, orderNumber: order.orderNumber, orderId: order.id };
      }),

    getPaymentDetails: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const { orders: ordersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const [order] = await dbInstance.select().from(ordersTable)
          .where(eq(ordersTable.id, input.orderId)).limit(1);

        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        if (order.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        if (!order.stripeSessionId) {
          return { paymentMethod: "daily_credit", receiptUrl: null, amountPaid: 0, currency: "aud", status: "free" };
        }

        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
          const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
            expand: ["payment_intent"],
          });
          const pi = session.payment_intent as any;
          const charge = pi?.latest_charge as any;
          return {
            paymentMethod: "stripe",
            receiptUrl: typeof charge === "object" ? charge?.receipt_url ?? null : null,
            amountPaid: session.amount_total ?? order.total,
            currency: session.currency ?? "aud",
            status: session.payment_status ?? "unknown",
          };
        } catch {
          return { paymentMethod: "stripe", receiptUrl: null, amountPaid: order.total, currency: "aud", status: "paid" };
        }
      }),
  }),

  square: router({
    /** Returns the Square OAuth authorization URL for the admin to open */
    getAuthUrl: protectedProcedure
      .input(z.object({ origin: z.string() }))
      .query(({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const redirectUri = `${input.origin}/api/square/callback`;
        // Use userId as state so we can match the callback back to this admin
        const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, origin: input.origin })).toString("base64url");
        const url = buildSquareAuthUrl(redirectUri, state);
        return { url };
      }),

    /** Returns the current Square connection status for the logged-in admin */
    getConnection: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const conn = await getSquareConnection(ctx.user.id);
      if (!conn) return { connected: false };
      return {
        connected: true,
        merchantName: conn.merchantName,
        merchantId: conn.merchantId,
        expiresAt: conn.expiresAt,
      };
    }),

    /** Disconnects the Square account */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await deleteSquareConnection(ctx.user.id);
      return { success: true };
    }),

    /** Syncs menu items from Square Catalog API */
    syncMenu: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const conn = await getSquareConnection(ctx.user.id);
      if (!conn) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No Square account connected. Please connect Square first.",
        });
      }
      const result = await syncSquareCatalog(conn.accessToken);
      return result;
    }),
  }),
});

export type AppRouter = typeof appRouter;
