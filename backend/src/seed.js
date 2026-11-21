import "dotenv/config";
import mongoose from "mongoose";
import { Customer, Order, Ticket, AuditLog } from "./models/index.js";

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([Customer.deleteMany(), Order.deleteMany(), Ticket.deleteMany(), AuditLog.deleteMany()]);

await Customer.insertMany([
  { name: "Priya Nair", email: "priya@example.com", tier: "gold" },
  { name: "Marco Silva", email: "marco@example.com" },
]);

const addr = { line1: "12 Park Lane", city: "Leeds", postcode: "LS1 4AB" };
await Order.insertMany([
  { orderId: "ORD-1001", customerEmail: "priya@example.com", total: 89.99, status: "processing", shippingAddress: addr,
    items: [{ sku: "BT-42", name: "Running shoes", qty: 1, price: 89.99 }] },
  { orderId: "ORD-1002", customerEmail: "priya@example.com", total: 249, status: "delivered", shippingAddress: addr,
    items: [{ sku: "JK-10", name: "Rain jacket", qty: 1, price: 249 }] },
  { orderId: "ORD-1003", customerEmail: "marco@example.com", total: 59, status: "shipped", shippingAddress: addr,
    items: [{ sku: "CP-01", name: "Cap", qty: 2, price: 29.5 }] },
  { orderId: "ORD-1004", customerEmail: "marco@example.com", total: 799, status: "delivered", shippingAddress: addr,
    items: [{ sku: "WT-77", name: "Smart watch", qty: 1, price: 799 }] },
]);

console.log("Seeded 2 customers and 4 orders");
await mongoose.disconnect();
