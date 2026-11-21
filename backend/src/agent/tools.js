import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Customer, Order, Ticket } from "../models/index.js";

export const MAX_REFUND = 500;

const orderId = z.string().regex(/^ORD-\d{4,}$/, "Order IDs look like ORD-1001");
const email = z.string().email();

// Tools never throw into the graph. Errors come back as data so the model can recover.
const run = (fn) => async (input) => {
  try {
    return JSON.stringify(await fn(input));
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
};

/* ------------------------------ READ-ONLY ------------------------------ */

export const lookupCustomer = tool(
  run(async ({ email }) => {
    const c = await Customer.findOne({ email: email.toLowerCase() })
      .select("name email tier -_id")
      .maxTimeMS(3000)
      .lean();
    return c ?? { found: false };
  }),
  {
    name: "lookup_customer",
    description: "Find a customer by email address.",
    schema: z.object({ email }),
  }
);

export const getOrder = tool(
  run(async ({ orderId }) => {
    const o = await Order.findOne({ orderId }).select("-_id -__v").maxTimeMS(3000).lean();
    return o ?? { found: false };
  }),
  {
    name: "get_order",
    description: "Get one order by ID: items, total, status, shipping address, refunds.",
    schema: z.object({ orderId }),
  }
);

export const listCustomerOrders = tool(
  run(async ({ email, limit }) =>
    Order.find({ customerEmail: email.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("orderId total status createdAt -_id")
      .maxTimeMS(3000)
      .lean()
  ),
  {
    name: "list_customer_orders",
    description: "List a customer's most recent orders.",
    schema: z.object({ email, limit: z.number().int().min(1).max(10).default(5) }),
  }
);

// Validated query tool: the model picks from whitelisted fields and operators.
// It never writes raw Mongo filters, so operator injection ($where, $ne ...) is impossible.
const FIELD_TYPES = { status: "string", customerEmail: "string", total: "number", createdAt: "date" };
const OPS = { gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte" };

function buildFilter(filters) {
  const q = {};
  for (const { field, op, value } of filters) {
    const type = FIELD_TYPES[field];
    let v = value;
    if (type === "string") {
      if (op !== "eq") throw new Error(`${field} only supports eq`);
      v = String(v);
    }
    if (type === "number") {
      v = Number(v);
      if (Number.isNaN(v)) throw new Error(`${field} needs a number`);
    }
    if (type === "date") {
      v = new Date(v);
      if (Number.isNaN(v.getTime())) throw new Error(`${field} needs an ISO date`);
    }
    if (op === "eq") q[field] = v;
    else q[field] = { ...(typeof q[field] === "object" ? q[field] : {}), [OPS[op]]: v };
  }
  return q;
}

export const queryOrders = tool(
  run(async ({ filters, limit }) =>
    Order.find(buildFilter(filters))
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("orderId customerEmail total status createdAt -_id")
      .maxTimeMS(3000)
      .lean()
  ),
  {
    name: "query_orders",
    description:
      "Search orders with up to 4 filters. Fields: status, customerEmail, total, createdAt. " +
      "status and customerEmail only support eq. Max 20 rows.",
    schema: z.object({
      filters: z
        .array(
          z.object({
            field: z.enum(["status", "customerEmail", "total", "createdAt"]),
            op: z.enum(["eq", "gt", "gte", "lt", "lte"]),
            value: z.string().describe("Value as text. Numbers like 200, dates as ISO strings."),
          })
        )
        .max(4),
      limit: z.number().int().min(1).max(20).default(10),
    }),
  }
);

/* --------------------- STATE-CHANGING (need approval) --------------------- */
// Policy is enforced here in code as well as in the prompt, so an approved call still can't break the rules.

export const cancelOrder = tool(
  run(async ({ orderId, customerEmail, reason }) => {
    const o = await Order.findOneAndUpdate(
      { orderId, customerEmail: customerEmail.toLowerCase(), status: "processing" },
      { status: "cancelled", $push: { notes: `Cancelled: ${reason}` } },
      { new: true }
    )
      .select("orderId status total -_id")
      .lean();
    if (!o) throw new Error("Order not found, or not in 'processing' status, so it cannot be cancelled.");
    return o;
  }),
  {
    name: "cancel_order",
    description: "Cancel a customer's order that is still 'processing'. Provide the verified customer's email. Requires human approval.",
    schema: z.object({ orderId, customerEmail: email, reason: z.string().min(3).max(200) }),
  }
);

export const issueRefund = tool(
  run(async ({ orderId, customerEmail, amount, reason }) => {
    if (amount > MAX_REFUND)
      throw new Error(`Refunds over $${MAX_REFUND} need a human agent. Open a high priority ticket instead.`);
    const order = await Order.findOneAndUpdate(
      {
        orderId,
        customerEmail: customerEmail.toLowerCase(),
        status: { $in: ["delivered", "cancelled"] },
        $expr: { $lte: [{ $add: [{ $ifNull: ["$refundedAmount", 0] }, amount] }, "$total"] },
      },
      { $inc: { refundedAmount: amount }, $push: { notes: `Refund $${amount}: ${reason}` } },
      { new: true, runValidators: true }
    ).select("orderId total refundedAmount status -_id").lean();
    if (!order) {
      const owned = await Order.findOne({ orderId, customerEmail: customerEmail.toLowerCase() }).select("total refundedAmount status -_id").lean();
      if (!owned) throw new Error("Order not found for that customer.");
      if (!["delivered", "cancelled"].includes(owned.status)) throw new Error(`Orders in '${owned.status}' status cannot be refunded.`);
      const remaining = owned.total - (owned.refundedAmount ?? 0);
      throw new Error(`Only $${remaining.toFixed(2)} is still refundable.`);
    }
    const updated = order.refundedAmount >= order.total
      ? await Order.findOneAndUpdate({ orderId, customerEmail: customerEmail.toLowerCase(), status: { $in: ["delivered", "cancelled"] }, refundedAmount: { $gte: order.total } }, { $set: { status: "refunded" } }, { new: true }).select("status -_id").lean()
      : null;
    return { orderId, refunded: amount, totalRefunded: order.refundedAmount, status: updated?.status ?? order.status };
  }),
  {
    name: "issue_refund",
    description: "Refund part or all of a customer's delivered/cancelled order (max $500). Provide the verified customer's email. Requires human approval.",
    schema: z.object({
      orderId,
      customerEmail: email,
      amount: z.number().min(0.01),
      reason: z.string().min(3).max(200),
    }),
  }
);

export const updateShippingAddress = tool(
  run(async ({ orderId, customerEmail, line1, city, postcode }) => {
    const o = await Order.findOneAndUpdate(
      { orderId, customerEmail: customerEmail.toLowerCase(), status: "processing" },
      { shippingAddress: { line1, city, postcode } },
      { new: true }
    )
      .select("orderId shippingAddress -_id")
      .lean();
    if (!o) throw new Error("Order not found, or already shipped, so the address cannot change.");
    return o;
  }),
  {
    name: "update_shipping_address",
    description: "Change the shipping address of a customer's 'processing' order. Provide the verified customer's email. Requires human approval.",
    schema: z.object({
      orderId,
      customerEmail: email,
      line1: z.string().min(3).max(120),
      city: z.string().min(2).max(60),
      postcode: z.string().min(3).max(12),
    }),
  }
);

export const createTicket = tool(
  run(async ({ customerEmail, subject, body, priority }) => {
    const t = await Ticket.create({
      ticketId: `TCK-${Date.now().toString(36).toUpperCase()}`,
      customerEmail,
      subject,
      body,
      priority,
    });
    return { ticketId: t.ticketId, status: t.status, priority: t.priority };
  }),
  {
    name: "create_ticket",
    description: "Open a support ticket for a human agent. Requires human approval.",
    schema: z.object({
      customerEmail: email,
      subject: z.string().min(3).max(120),
      body: z.string().min(3).max(1000),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }),
  }
);

export const readTools = [lookupCustomer, getOrder, listCustomerOrders, queryOrders];
export const writeTools = [cancelOrder, issueRefund, updateShippingAddress, createTicket];
export const allTools = [...readTools, ...writeTools];
export const WRITE_TOOL_NAMES = new Set(writeTools.map((t) => t.name));
