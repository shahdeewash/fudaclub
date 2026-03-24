import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { devRouter } from "./dev-routers";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { nanoid } from "nanoid";

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
    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user already has active subscription
        const existing = await db.getActiveSubscriptionByUserId(ctx.user.id);
        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User already has an active subscription',
          });
        }

        // In MVP, we simulate Stripe subscription
        const now = new Date();
        const twoWeeksLater = new Date(now);
        twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

        const subscription = await db.createSubscription({
          userId: ctx.user.id,
          stripeSubscriptionId: `sim_sub_${nanoid(10)}`,
          stripeCustomerId: `sim_cus_${nanoid(10)}`,
          status: 'active',
          planAmount: 2500, // $25.00
          currentPeriodStart: now,
          currentPeriodEnd: twoWeeksLater,
          cancelAtPeriodEnd: false,
        });

        // Update user's company
        const dbInstance = await db.getDb();
        if (dbInstance) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await dbInstance.update(users)
            .set({ companyId: input.companyId })
            .where(eq(users.id, ctx.user.id));
        }

        return subscription;
      }),

    getMine: protectedProcedure.query(async ({ ctx }) => {
      return await db.getActiveSubscriptionByUserId(ctx.user.id);
    }),
  }),

  menu: router({
    getAll: publicProcedure.query(async () => {
      return await db.getAllMenuItems();
    }),

    getTodaysSpecial: publicProcedure.query(async () => {
      return await db.getTodaysSpecial();
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
  }),

  order: router({
    create: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          menuItemId: z.number(),
          quantity: z.number().min(1),
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
          fulfillmentType: isFreeDelivery ? 'delivery' : 'pickup',
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
        status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'canceled']),
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
  }),
});

export type AppRouter = typeof appRouter;
