import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, nowIso } from "../db.js";

export const authRouter = Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Sign in required" });
  }
  next();
}

export function optionalAuth(req, res, next) {
  next();
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, created_at: user.created_at };
}

authRouter.post("/signup", loginLimit, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const password = String(req.body?.password || "");
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (name.length < 2) return res.status(400).json({ error: "Please give a name (at least 2 characters)." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (password.length > 72) return res.status(400).json({ error: "Password is too long." });
  const exists = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "An account with that email already exists." });
  const hash = bcrypt.hashSync(password, 12);
  const info = await db
    .prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)")
    .run(email, hash, name, nowIso());
  await db.prepare(
    "INSERT INTO user_preferences (user_id, home_area, updated_at) VALUES (?, ?, ?)"
  ).run(info.lastInsertRowid, "Pagar, Tongi, Gazipur", nowIso());
  req.session.userId = info.lastInsertRowid;
  const user = await db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post("/login", loginLimit, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("briefly.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });
  const user = await db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user: user ? publicUser(user) : null });
});
