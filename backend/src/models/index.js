import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const customerSchema = new Schema(
  {
    name: String,
    email: { type: String, unique: true, index: true, lowercase: true },
    tier: { type: String, enum: ["standard", "gold"], default: "standard" },
  },
  { timestamps: true }
);

const orderSchema = new Schema(
  {
    orderId: { type: String, unique: true, index: true },
    customerEmail: { type: String, index: true, lowercase: true },
    items: [{ sku: String, name: String, qty: Number, price: Number }],
    total: Number,
    refundedAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "processing",
    },
    shippingAddress: { line1: String, city: String, postcode: String },
    notes: [String],
  },
  { timestamps: true }
);

const ticketSchema = new Schema(
  {
    ticketId: { type: String, unique: true },
    customerEmail: { type: String, lowercase: true },
    subject: String,
    body: String,
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

// Every human decision on a state-changing action is recorded here.
const auditSchema = new Schema(
  {
    threadId: String,
    tool: String,
    args: Schema.Types.Mixed,
    decision: { type: String, enum: ["approved", "rejected"] },
    note: String,
  },
  { timestamps: true }
);

export const Customer = models.Customer || model("Customer", customerSchema);
export const Order = models.Order || model("Order", orderSchema);
export const Ticket = models.Ticket || model("Ticket", ticketSchema);
export const AuditLog = models.AuditLog || model("AuditLog", auditSchema);
