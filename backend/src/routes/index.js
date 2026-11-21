import { Router } from "express";
import { sendMessage, decide, getThread } from "../controllers/chat.controller.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.post("/chat", wrap(sendMessage));
router.post("/approve", wrap(decide));
router.get("/thread/:threadId", wrap(getThread));

export default router;
