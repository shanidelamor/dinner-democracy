import { resolveRecipe } from "./recipe-options.js";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { allRecipes, transaction, saveIngredients } from "./db.js";
import {
  generateDays,
  shoppingList,
  validateMenu,
  parseQuantity,
  sections,
} from "./domain.js";
import { ingredientDefinitions } from "./recipes.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const passwordHash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};
const passwordMatches = (p, stored) => {
  const [salt, digest] = stored.split(":");
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(digest, "hex"));
};
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const ids = z.enum(["shani", "james", "xander"]);
const quantity = z.number().positive().max(1000);
const vegetableIds = [
  "cucumber",
  "carrot",
  "onion",
  "potato",
  "lettuce",
  "tomato",
  "broccoli",
  "snapPeas",
  "zucchini",
  "bokChoy",
  "cabbage",
  "spinach",
  "greenBeans",
  "mushroom",
  "broccolini",
  "squash",
  "brussels",
  "pumpkin",
  "peas",
  "sweetPotato",
  "arugula",
  "cauliflower",
  "shiitake",
  "oysterMushroom",
];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }, "Use a valid calendar date");
const parse = (schema, req) => schema.parse(req.body);
export function createApp(
  db,
  {
    production = false,
    setupKey = process.env.SETUP_KEY,
    staticDir = resolve("dist"),
    clientKey = (req) => req.ip,
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "250kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!req.is("application/json"))
        return res.status(415).json({ error: "JSON is required." });
      const origin = req.get("origin");
      if (origin) {
        try {
          if (
            new URL(origin).host !== req.get("host") &&
            !(!production && new URL(origin).hostname === "localhost")
          )
            return res
              .status(403)
              .json({ error: "Cross-origin request refused." });
        } catch {
          return res.status(403).json({ error: "Invalid origin." });
        }
      }
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => clientKey(req) || "unknown",
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: {
      error: "Too many sign-in attempts. Please try again in 15 minutes.",
    },
  });
  const setSession = (user, res) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      user,
      Date.now() + 30 * 86400000,
    );
    res.cookie("dd_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 30 * 86400000,
      path: "/",
    });
  };
  app.get("/api/health", (req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", storage: "sqlite" });
  });
  app.get("/api/status", (req, res) =>
    res.json({
      initialized: !!db.prepare("SELECT count(*) n FROM users").get().n,
      requiresSetupKey: production || !!setupKey,
    }),
  );
  app.post("/api/setup", authLimit, (req, res) => {
    const b = parse(
      z.object({
        adminPassword: z.string().min(8).max(128),
        jamesPassword: z.string().min(6).max(128),
        xanderPassword: z.string().min(6).max(128),
        setupKey: z.string().optional(),
      }),
      req,
    );
    if (db.prepare("SELECT count(*) n FROM users").get().n)
      fail("This household is already set up.", 409);
    if (
      (production || setupKey) &&
      (!setupKey ||
        !b.setupKey ||
        !timingSafeEqual(
          Buffer.from(hash(b.setupKey)),
          Buffer.from(hash(setupKey)),
        ))
    )
      fail("A valid SETUP_KEY from your hosting settings is required.", 403);
    transaction(db, () => {
      if (db.prepare("SELECT count(*) n FROM users").get().n)
        fail("Already initialized.", 409);
      for (const [id, name, role, p] of [
        ["shani", "Shani", "admin", b.adminPassword],
        ["james", "James", "member", b.jamesPassword],
        ["xander", "Xander", "member", b.xanderPassword],
      ])
        db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
          id,
          name,
          role,
          passwordHash(p),
        );
      const r = db
        .prepare("INSERT INTO rounds(title) VALUES('Our first dinner vote')")
        .run();
      for (const recipe of allRecipes(db).filter(
        (r) => r.category === "Dinner" && !r.archived,
      ))
        db.prepare("INSERT INTO round_recipes VALUES(?,?)").run(
          r.lastInsertRowid,
          recipe.id,
        );
    });
    setSession("shani", res);
    res.json({ ok: true });
  });
  app.post("/api/login", authLimit, (req, res) => {
    const b = parse(
      z.object({ userId: ids, password: z.string().max(128) }),
      req,
    );
    const u = db.prepare("SELECT * FROM users WHERE id=?").get(b.userId);
    if (!u || !passwordMatches(b.password, u.password_hash))
      fail("That profile and password do not match.", 401);
    setSession(u.id, res);
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("dd_session="))
      ?.slice(11);
    const session =
      token &&
      db
        .prepare(
          "SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        )
        .get(hash(token), Date.now());
    if (!session) return res.status(401).json({ error: "Please sign in." });
    req.user = session;
    next();
  });
  const admin = (req, res, next) => {
    if (req.user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Only Shani can make this change." });
    next();
  };
  app.post("/api/logout", (req, res) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("dd_session="))
      ?.slice(11);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
    res.clearCookie("dd_session", { path: "/" });
    res.json({ ok: true });
  });
  const getMenu = (id) => {
    const m = db.prepare("SELECT * FROM menus WHERE id=?").get(id);
    if (!m) fail("Menu not found.", 404);
    return m;
  };
  const dayRows = (id) =>
    db.prepare("SELECT * FROM menu_days WHERE menu_id=? ORDER BY date").all(id);
  const invalidate = (id) => {
    db.prepare("UPDATE menus SET status='draft' WHERE id=?").run(id);
    db.prepare(
      "DELETE FROM shopping_state WHERE menu_id=? AND item_key NOT LIKE 'manual:%'",
    ).run(id);
  };
  app.get("/api/state", (req, res) => {
    const isAdmin = req.user.role === "admin";
    const menus = db
      .prepare(
        `SELECT * FROM menus ${isAdmin ? "" : "WHERE status='approved'"} ORDER BY id DESC`,
      )
      .all()
      .map((m) => ({
        ...m,
        days: dayRows(m.id),
        tasks: db
          .prepare("SELECT * FROM tasks WHERE menu_id=? ORDER BY date,id")
          .all(m.id),
      }));
    const pantry = db
      .prepare("SELECT * FROM pantry")
      .all()
      .map((p) => ({
        ...p,
        name: ingredientDefinitions[p.ingredient_id]?.[0] || p.ingredient_id,
      }));
    const manual = db
      .prepare("SELECT * FROM shopping_manual WHERE active=1")
      .all();
    const rr = allRecipes(db);
    const lists = {};
    for (const m of menus)
      lists[m.id] = shoppingList({
        menu: m,
        days: m.days,
        tasks: m.tasks,
        recipes: rr,
        manual,
        pantry,
        states: db
          .prepare("SELECT * FROM shopping_state WHERE menu_id=?")
          .all(m.id),
      });
    res.json({
      user: req.user,
      ingredientCatalog: Object.entries(ingredientDefinitions).map(
        ([id, [name, section]]) => ({ id, name, section }),
      ),
      users: db.prepare("SELECT id,name,role FROM users").all(),
      recipes: rr,
      rounds: db
        .prepare("SELECT * FROM rounds ORDER BY id DESC")
        .all()
        .map((r) => ({
          ...r,
          recipeIds: db
            .prepare("SELECT recipe_id FROM round_recipes WHERE round_id=?")
            .all(r.id)
            .map((x) => x.recipe_id),
        })),
      votes: isAdmin
        ? db.prepare("SELECT * FROM votes").all()
        : db.prepare("SELECT * FROM votes WHERE user_id=?").all(req.user.id),
      favorites: db
        .prepare("SELECT recipe_id FROM favorites WHERE user_id=?")
        .all(req.user.id)
        .map((x) => x.recipe_id),
      requests: db.prepare("SELECT * FROM requests ORDER BY id DESC").all(),
      menus,
      shoppingManual: manual,
      shoppingLists: lists,
      pantry,
      settings: Object.fromEntries(
        db
          .prepare("SELECT * FROM settings")
          .all()
          .map((x) => [x.key, JSON.parse(x.value)]),
      ),
    });
  });
  app.post("/api/rounds", admin, (req, res) => {
    const b = parse(
      z.object({ title: z.string().trim().min(1).max(120) }),
      req,
    );
    const id = transaction(db, () => {
      db.prepare("UPDATE rounds SET status='closed' WHERE status='open'").run();
      const result = db
        .prepare("INSERT INTO rounds(title) VALUES(?)")
        .run(b.title);
      for (const r of allRecipes(db).filter(
        (r) => r.category === "Dinner" && !r.archived,
      ))
        db.prepare("INSERT INTO round_recipes VALUES(?,?)").run(
          result.lastInsertRowid,
          r.id,
        );
      return Number(result.lastInsertRowid);
    });
    res.json({ id });
  });
  app.patch("/api/rounds/:id", admin, (req, res) => {
    const b = parse(z.object({ status: z.enum(["open", "closed"]) }), req);
    const round = db
      .prepare("SELECT * FROM rounds WHERE id=?")
      .get(req.params.id);
    if (!round) fail("Round not found.", 404);
    transaction(db, () => {
      if (b.status === "open")
        db.prepare(
          "UPDATE rounds SET status='closed' WHERE status='open'",
        ).run();
      db.prepare("UPDATE rounds SET status=? WHERE id=?").run(
        b.status,
        round.id,
      );
    });
    res.json({ ok: true });
  });
  app.put("/api/votes", (req, res) => {
    const b = parse(
      z.object({
        roundId: z.number().int().positive(),
        recipeId: z.string(),
        choice: z.enum(["yes", "no", "maybe"]).nullable(),
      }),
      req,
    );
    const round = db
      .prepare("SELECT id FROM rounds WHERE id=? AND status='open'")
      .get(b.roundId);
    if (!round) fail("This voting round is closed.");
    if (
      !db
        .prepare("SELECT 1 FROM round_recipes WHERE round_id=? AND recipe_id=?")
        .get(b.roundId, b.recipeId)
    )
      fail("Recipe is not in this round.");
    if (b.choice === null)
      db.prepare(
        "DELETE FROM votes WHERE round_id=? AND user_id=? AND recipe_id=?",
      ).run(b.roundId, req.user.id, b.recipeId);
    else
      db.prepare(
        "INSERT INTO votes(round_id,user_id,recipe_id,choice) VALUES(?,?,?,?) ON CONFLICT(round_id,user_id,recipe_id) DO UPDATE SET choice=excluded.choice,updated_at=CURRENT_TIMESTAMP",
      ).run(b.roundId, req.user.id, b.recipeId, b.choice);
    res.json({ ok: true });
  });
  app.put("/api/favorites/:recipeId", (req, res) => {
    const b = parse(z.object({ favorite: z.boolean() }), req);
    if (
      !db.prepare("SELECT 1 FROM recipes WHERE id=?").get(req.params.recipeId)
    )
      fail("Recipe not found.", 404);
    if (b.favorite)
      db.prepare("INSERT OR IGNORE INTO favorites VALUES(?,?)").run(
        req.user.id,
        req.params.recipeId,
      );
    else
      db.prepare("DELETE FROM favorites WHERE user_id=? AND recipe_id=?").run(
        req.user.id,
        req.params.recipeId,
      );
    res.json({ ok: true });
  });
  const ingredientInput = z.object({
    id: z.string(),
    quantity,
    unit: z.enum([
      "lb",
      "oz",
      "cup",
      "tbsp",
      "tsp",
      "ml",
      "each",
      "can",
      "pkg",
      "box",
    ]),
    note: z.string().max(500).optional(),
  });
  app.post("/api/recipes", admin, (req, res) => {
    const b = parse(
      z.object({
        title: z.string().trim().min(1).max(160),
        cuisine: z.string().trim().min(1).max(80),
        category: z.enum(["Dinner", "Side", "Lunch & leftovers", "Baking"]),
        protein: z.enum([
          "Chicken",
          "Beef",
          "Pork",
          "Lamb",
          "Fish",
          "Shrimp",
          "Turkey & beef",
          "Vegetarian",
        ]),
        cut: z.string().trim().min(5).max(250),
        vegetables: z.string().trim().min(3).max(250),
        description: z.string().min(1).max(1500),
        prep: z.number().int().min(0).max(1440),
        cook: z.number().int().min(0).max(1440),
        servings: quantity,
        ingredients: z.array(ingredientInput).min(1).max(70),
        steps: z.array(z.string().trim().min(1).max(3000)).min(1).max(40),
        notes: z.string().max(5000),
        dairy: z.boolean(),
        egg: z.boolean(),
        glutenFree: z.literal(true),
      }),
      req,
    );
    for (const i of b.ingredients)
      if (!ingredientDefinitions[i.id])
        fail("Choose ingredients from the catalog.");
    if (
      b.category === "Dinner" &&
      !b.ingredients.some((i) => vegetableIds.includes(i.id))
    )
      fail("Every dinner needs a vegetable ingredient or side.");
    if (
      b.protein === "Chicken" &&
      (!/breast|thigh/i.test(b.cut) ||
        !/boneless|bone-in/i.test(b.cut) ||
        !/skinless|skin-on/i.test(b.cut))
    )
      fail(
        "Specify chicken breasts or thighs, boneless or bone-in, and skinless or skin-on.",
      );
    const id = "family-" + randomBytes(6).toString("hex");
    const reference =
      allRecipes(db).find((r) => r.protein === b.protein && !r.archived) ||
      allRecipes(db)[0];
    const recipe = {
      ...b,
      id,
      image: reference.image,
      tags: ["Gluten-free", "New family recipe"],
      madeBefore: false,
      favorite: false,
      archived: false,
      source: "Added by Shani",
      sourceNote:
        "Family recipe entered by Shani. Review ingredient labels and cooking temperatures before use. Photo is illustrative.",
      leftover:
        "Refrigerate within 2 hours, use within 3–4 days, and reheat to 165°F. Cool rice within 1 hour and use within 24 hours.",
      version: 1,
      ingredients: b.ingredients.map((i) => ({
        ...i,
        name: ingredientDefinitions[i.id][0],
        section: ingredientDefinitions[i.id][1],
      })),
    };
    transaction(db, () => {
      db.prepare("INSERT INTO recipes(id,data,version) VALUES(?,?,1)").run(
        id,
        JSON.stringify(recipe),
      );
      saveIngredients(db, id, recipe.ingredients);
    });
    res.json({ id });
  });
  app.patch("/api/recipes/:id/archive", admin, (req, res) => {
    const b = parse(z.object({ archived: z.boolean() }), req);
    const row = db
      .prepare("SELECT * FROM recipes WHERE id=?")
      .get(req.params.id);
    if (!row) fail("Recipe not found.", 404);
    const r = JSON.parse(row.data);
    if (!b.archived && !r.ingredients.length)
      fail(
        "This archived idea has no recipe. Add a complete new recipe instead.",
      );
    transaction(db, () => {
      db.prepare(
        "INSERT INTO recipe_versions(recipe_id,version,data,edited_by) VALUES(?,?,?,?)",
      ).run(row.id, row.version, row.data, req.user.id);
      db.prepare("UPDATE recipes SET data=?,version=version+1 WHERE id=?").run(
        JSON.stringify({
          ...r,
          archived: b.archived,
          version: row.version + 1,
        }),
        row.id,
      );
      if (b.archived)
        db.prepare(
          "DELETE FROM round_recipes WHERE recipe_id=? AND round_id IN (SELECT id FROM rounds WHERE status='open')",
        ).run(row.id);
      for (const m of db
        .prepare(
          "SELECT menu_id FROM menu_days WHERE recipe_id=? UNION SELECT menu_id FROM tasks WHERE recipe_id=?",
        )
        .all(row.id, row.id))
        invalidate(m.menu_id);
    });
    res.json({ ok: true });
  });
  app.post("/api/recipes/:id/catalog-review", admin, (req, res) => {
    const row = db
      .prepare("SELECT * FROM recipes WHERE id=?")
      .get(req.params.id);
    if (!row) fail("Recipe not found.", 404);
    const current = JSON.parse(row.data),
      reviewed = allRecipes(db).find((r) => r.id === row.id)?.catalogProposal;
    if (!reviewed || !current.catalogConflicts?.length)
      fail("No pending recipe-library review.");
    transaction(db, () => {
      db.prepare(
        "INSERT INTO recipe_versions(recipe_id,version,data,edited_by) VALUES(?,?,?,?)",
      ).run(row.id, row.version, row.data, req.user.id);
      const fields = Object.fromEntries(
        current.catalogConflicts.map((field) => [field, reviewed[field]]),
      );
      const next = {
        ...current,
        ...fields,
        catalogConflicts: [],
        version: row.version + 1,
      };
      db.prepare("UPDATE recipes SET data=?,version=version+1 WHERE id=?").run(
        JSON.stringify(next),
        row.id,
      );
      saveIngredients(db, row.id, next.ingredients);
      for (const m of db
        .prepare(
          "SELECT menu_id FROM menu_days WHERE recipe_id=? UNION SELECT menu_id FROM tasks WHERE recipe_id=?",
        )
        .all(row.id, row.id))
        invalidate(m.menu_id);
    });
    res.json({ ok: true });
  });
  app.get("/api/recipes/:id/history", admin, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT version,created_at,edited_by,data FROM recipe_versions WHERE recipe_id=? ORDER BY version DESC",
        )
        .all(req.params.id)
        .map((v) => ({ ...v, data: JSON.parse(v.data) })),
    ),
  );
  app.patch("/api/recipes/:id", admin, (req, res) => {
    const b = parse(
      z.object({
        title: z.string().trim().min(1).max(160),
        protein: z
          .enum([
            "Chicken",
            "Beef",
            "Pork",
            "Lamb",
            "Fish",
            "Shrimp",
            "Turkey & beef",
            "Vegetarian",
          ])
          .optional(),
        cut: z.string().trim().min(5).max(250).optional(),
        vegetables: z.string().trim().min(3).max(250).optional(),
        prep: z.number().int().min(0).max(1440).optional(),
        cook: z.number().int().min(0).max(1440).optional(),
        description: z.string().max(1500),
        notes: z.string().max(5000),
        steps: z.array(z.string().trim().min(1).max(3000)).min(1).max(40),
        ingredients: z
          .array(
            z.object({
              id: z.string(),
              quantity: quantity,
              unit: z.enum([
                "lb",
                "oz",
                "cup",
                "tbsp",
                "tsp",
                "ml",
                "each",
                "can",
                "pkg",
                "box",
              ]),
              note: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(70),
        madeBefore: z.boolean().nullable(),
        favorite: z.boolean(),
        servings: quantity,
      }),
      req,
    );
    const old = db
      .prepare("SELECT * FROM recipes WHERE id=?")
      .get(req.params.id);
    if (!old) fail("Recipe not found.", 404);
    const original = JSON.parse(old.data);
    if (
      original.category === "Dinner" &&
      !b.ingredients.some((i) => vegetableIds.includes(i.id))
    )
      fail("Every dinner must keep a vegetable ingredient or side.");
    const editedProtein = b.protein ?? original.protein,
      editedCut = b.cut ?? original.cut;
    if (
      editedProtein === "Chicken" &&
      (!/breast|thigh/i.test(editedCut) ||
        !/boneless|bone-in/i.test(editedCut) ||
        !/skinless|skin-on/i.test(editedCut))
    )
      fail(
        "Specify chicken breasts or thighs, boneless or bone-in, and skinless or skin-on.",
      );
    if (original.archived)
      fail("Archived ideas must be developed in a separate recipe before use.");
    for (const i of b.ingredients)
      if (!ingredientDefinitions[i.id])
        fail("Unknown ingredient; choose one from the shared catalog.");
    transaction(db, () => {
      db.prepare(
        "INSERT INTO recipe_versions(recipe_id,version,data,edited_by) VALUES(?,?,?,?)",
      ).run(old.id, old.version, old.data, req.user.id);
      const updated = {
        ...original,
        ...b,
        ingredients: b.ingredients.map((i) => ({
          ...i,
          name: ingredientDefinitions[i.id][0],
          section: ingredientDefinitions[i.id][1],
        })),
        source: "Shani’s edited version",
        version: old.version + 1,
        dairy: b.ingredients.some((i) =>
          [
            "cream",
            "sourCream",
            "butter",
            "goat",
            "parmesan",
            "mozzarella",
            "cheddar",
            "milkPowder",
            "toffee",
          ].includes(i.id),
        ),
      };
      db.prepare("UPDATE recipes SET data=?,version=version+1 WHERE id=?").run(
        JSON.stringify(updated),
        old.id,
      );
      saveIngredients(db, old.id, updated.ingredients);
      for (const m of db
        .prepare(
          "SELECT menu_id FROM menu_days WHERE recipe_id=? UNION SELECT menu_id FROM tasks WHERE recipe_id=?",
        )
        .all(old.id, old.id))
        invalidate(m.menu_id);
    });
    res.json({ ok: true });
  });
  app.post("/api/requests", (req, res) => {
    const b = parse(
      z.object({
        message: z.string().trim().min(1).max(3000),
        category: z.enum(["grocery", "cooking"]),
      }),
      req,
    );
    const lines = b.message
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 30) fail("Please submit at most 30 items at a time.");
    transaction(db, () => {
      for (const message of lines) {
        const q = parseQuantity(message);
        db.prepare(
          "INSERT INTO requests(user_id,message,category,quantity,unit) VALUES(?,?,?,?,?)",
        ).run(req.user.id, message, b.category, q.quantity, q.unit);
      }
    });
    res.json({ ok: true });
  });
  const ownRequest = (req) => {
    const r = db
      .prepare("SELECT * FROM requests WHERE id=?")
      .get(req.params.id);
    if (!r) fail("Request not found.", 404);
    if (r.user_id !== req.user.id && req.user.role !== "admin")
      fail("You can only edit your own requests.", 403);
    return r;
  };
  app.patch("/api/requests/:id", (req, res) => {
    const r = ownRequest(req);
    const b = parse(
      z.object({
        message: z.string().trim().min(1).max(1000).optional(),
        status: z
          .enum(["pending", "approved", "declined", "completed"])
          .optional(),
      }),
      req,
    );
    if (b.status && req.user.role !== "admin")
      fail("Only Shani reviews requests.", 403);
    if (b.message && r.status !== "pending")
      fail("Only pending requests can be edited.");
    transaction(db, () => {
      const q = b.message
        ? parseQuantity(b.message)
        : { quantity: r.quantity, unit: r.unit };
      db.prepare(
        "UPDATE requests SET message=?,status=?,quantity=?,unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        b.message || r.message,
        b.status || r.status,
        q.quantity,
        q.unit,
        r.id,
      );
      if (b.status && ["pending", "declined"].includes(b.status)) {
        db.prepare("DELETE FROM shopping_manual WHERE request_id=?").run(r.id);
        const task = db
          .prepare("SELECT menu_id FROM tasks WHERE request_id=?")
          .get(r.id);
        if (task) {
          db.prepare("DELETE FROM tasks WHERE request_id=?").run(r.id);
          invalidate(task.menu_id);
        }
      }
    });
    res.json({ ok: true });
  });
  app.delete("/api/requests/:id", (req, res) => {
    const r = ownRequest(req);
    if (req.user.role !== "admin" && r.status !== "pending")
      fail("Ask Shani to remove an approved request.");
    transaction(db, () => {
      const task = db
        .prepare("SELECT menu_id FROM tasks WHERE request_id=?")
        .get(r.id);
      db.prepare("DELETE FROM tasks WHERE request_id=?").run(r.id);
      db.prepare("DELETE FROM shopping_manual WHERE request_id=?").run(r.id);
      db.prepare("DELETE FROM requests WHERE id=?").run(r.id);
      if (task) invalidate(task.menu_id);
    });
    res.json({ ok: true });
  });
  const manualSchema = z.object({
    menuId: z.number().int().positive(),
    name: z.string().trim().min(1).max(250),
    quantity: quantity,
    unit: z.enum([
      "each",
      "box",
      "can",
      "pkg",
      "lb",
      "oz",
      "cup",
      "tbsp",
      "tsp",
      "ml",
    ]),
    section: z.enum(sections),
    requestId: z.number().int().positive().nullable().optional(),
  });
  app.post("/api/shopping/manual", admin, (req, res) => {
    const b = parse(manualSchema, req);
    const menu = getMenu(b.menuId);
    if (menu.status !== "approved")
      fail("Approve a menu before adding shopping items.");
    if (b.requestId) {
      const r = db
        .prepare("SELECT * FROM requests WHERE id=?")
        .get(b.requestId);
      if (
        !r ||
        r.category !== "grocery" ||
        !["approved", "completed"].includes(r.status)
      )
        fail("Approve the grocery request before adding it.");
    }
    db.prepare(
      "INSERT INTO shopping_manual(menu_id,name,quantity,unit,section,request_id) VALUES(?,?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET menu_id=excluded.menu_id,name=excluded.name,quantity=excluded.quantity,unit=excluded.unit,section=excluded.section,active=1",
    ).run(b.menuId, b.name, b.quantity, b.unit, b.section, b.requestId || null);
    if (b.requestId) {
      const item = db
        .prepare("SELECT id FROM shopping_manual WHERE request_id=?")
        .get(b.requestId);
      db.prepare("DELETE FROM shopping_state WHERE item_key=?").run(
        `manual:${item.id}`,
      );
    }
    res.json({ ok: true });
  });
  app.delete("/api/shopping/manual/:id", admin, (req, res) => {
    db.prepare("UPDATE shopping_manual SET active=0 WHERE id=?").run(
      req.params.id,
    );
    res.json({ ok: true });
  });
  const genSchema = z.object({
    title: z.string().trim().min(1).max(120),
    startDate: date,
    days: z.union([z.literal(7), z.literal(14)]),
    roundId: z.number().int().positive(),
    attendees: z
      .array(ids)
      .min(1)
      .max(3)
      .transform((a) => [...new Set(a)]),
    portions: quantity,
    leftovers: z.boolean(),
  });
  const saveDays = (menuId, rows, old = []) => {
    for (const d of rows) {
      const prev = old.find((o) => o.date === d.date);
      if (prev) {
        if (!d.locked)
          db.prepare(
            "UPDATE menu_days SET recipe_id=?,kind=?,portions=?,attendees=?,leftover_of=NULL,variation_id=NULL,reason=? WHERE id=?",
          ).run(
            d.recipe_id,
            d.kind,
            d.portions,
            d.attendees,
            d.reason,
            prev.id,
          );
      } else
        db.prepare(
          "INSERT INTO menu_days(menu_id,date,recipe_id,kind,portions,attendees,locked,reason) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          menuId,
          d.date,
          d.recipe_id,
          d.kind,
          d.portions,
          d.attendees,
          d.locked,
          d.reason,
        );
    }
    const saved = dayRows(menuId);
    for (const d of rows.filter((d) => d.leftover_date)) {
      const from = saved.find((s) => s.date === d.leftover_date);
      db.prepare(
        "UPDATE menu_days SET leftover_of=? WHERE menu_id=? AND date=?",
      ).run(from.id, menuId, d.date);
    }
    validateMenu(dayRows(menuId), allRecipes(db));
  };
  app.post("/api/menus/generate", admin, (req, res) => {
    const b = parse(genSchema, req);
    if (!db.prepare("SELECT 1 FROM rounds WHERE id=?").get(b.roundId))
      fail("Voting round not found.");
    const recent = db
      .prepare(
        "SELECT md.recipe_id FROM menu_days md JOIN menus m ON m.id=md.menu_id WHERE m.status='approved' ORDER BY md.date DESC LIMIT 28",
      )
      .all()
      .map((r) => r.recipe_id);
    const rows = generateDays({
      recipes: allRecipes(db),
      votes: db.prepare("SELECT * FROM votes").all(),
      ...b,
      tacoDay: JSON.parse(
        db.prepare("SELECT value FROM settings WHERE key='tacoDay'").get()
          .value,
      ),
      recent,
    });
    const id = transaction(db, () => {
      const result = db
        .prepare(
          "INSERT INTO menus(title,start_date,days,round_id) VALUES(?,?,?,?)",
        )
        .run(b.title, b.startDate, b.days, b.roundId);
      saveDays(Number(result.lastInsertRowid), rows);
      return Number(result.lastInsertRowid);
    });
    res.json({ id });
  });
  app.post("/api/menus/:id/regenerate", admin, (req, res) => {
    const m = getMenu(req.params.id);
    transaction(db, () => {
      const existing = dayRows(m.id);
      const rows = generateDays({
        recipes: allRecipes(db),
        votes: db.prepare("SELECT * FROM votes").all(),
        roundId: m.round_id,
        startDate: m.start_date,
        days: m.days,
        tacoDay: JSON.parse(
          db.prepare("SELECT value FROM settings WHERE key='tacoDay'").get()
            .value,
        ),
        existing,
      });
      saveDays(m.id, rows, existing);
      invalidate(m.id);
    });
    res.json({ ok: true });
  });
  app.patch("/api/menu-days/:id", admin, (req, res) => {
    const d = db
      .prepare("SELECT * FROM menu_days WHERE id=?")
      .get(req.params.id);
    if (!d) fail("Day not found.", 404);
    const b = parse(
      z.object({
        recipeId: z.string().nullable().optional(),
        variationId: z.string().nullable().optional(),
        kind: z.enum(["cook", "leftover", "out"]).optional(),
        portions: quantity.optional(),
        attendees: z
          .array(ids)
          .min(1)
          .max(3)
          .transform((a) => [...new Set(a)])
          .optional(),
        locked: z.boolean().optional(),
        leftoverOf: z.number().int().positive().nullable().optional(),
      }),
      req,
    );
    if (
      d.locked &&
      b.locked !== false &&
      Object.keys(b).some((k) => k !== "locked")
    )
      fail("Unlock this dinner before editing it.");
    transaction(db, () => {
      let source = b.leftoverOf !== undefined ? b.leftoverOf : d.leftover_of;
      let kind = b.kind || d.kind;
      let recipe = b.recipeId !== undefined ? b.recipeId : d.recipe_id;
      let variation =
        b.variationId !== undefined
          ? b.variationId
          : recipe === d.recipe_id
            ? d.variation_id
            : null;
      if (kind === "out") {
        recipe = null;
        source = null;
        variation = null;
      }
      if (kind === "cook") source = null;
      if (kind === "leftover" && source) {
        const s = db
          .prepare("SELECT * FROM menu_days WHERE id=? AND menu_id=?")
          .get(source, d.menu_id);
        if (!s) fail("Choose a cooked dinner in this menu.");
        recipe = s.recipe_id;
        variation = s.variation_id;
      }
      db.prepare(
        "UPDATE menu_days SET recipe_id=?,kind=?,portions=?,attendees=?,locked=?,leftover_of=?,variation_id=?,reason=? WHERE id=?",
      ).run(
        recipe,
        kind,
        b.portions ?? d.portions,
        b.attendees ? JSON.stringify(b.attendees) : d.attendees,
        b.locked === undefined ? d.locked : Number(b.locked),
        source,
        variation || null,
        "Adjusted by Shani",
        d.id,
      );
      if (kind === "leftover" && b.locked)
        db.prepare("UPDATE menu_days SET locked=1 WHERE id=?").run(source);
      if (
        kind === "cook" &&
        (recipe !== d.recipe_id ||
          (variation || null) !== (d.variation_id || null))
      ) {
        const children = db
          .prepare("SELECT * FROM menu_days WHERE leftover_of=?")
          .all(d.id);
        if (children.some((child) => child.locked))
          fail("Unlock the linked leftover dinner before changing this batch.");
        db.prepare(
          "UPDATE menu_days SET recipe_id=?,variation_id=? WHERE leftover_of=?",
        ).run(recipe, variation || null, d.id);
      }
      validateMenu(dayRows(d.menu_id), allRecipes(db));
      invalidate(d.menu_id);
    });
    res.json({ ok: true });
  });
  app.post("/api/menus/:id/swap", admin, (req, res) => {
    const m = getMenu(req.params.id);
    const b = parse(
      z.object({ a: z.number().int(), b: z.number().int() }),
      req,
    );
    const days = dayRows(m.id),
      a = days.find((d) => d.id === b.a),
      c = days.find((d) => d.id === b.b);
    if (!a || !c || a.locked || c.locked)
      fail("Choose two unlocked days in this menu.");
    if (
      [a, c].some(
        (d) =>
          d.kind === "leftover" || days.some((x) => x.leftover_of === d.id),
      )
    )
      fail("Detach linked leftovers before moving those dinners.");
    transaction(db, () => {
      for (const [target, from] of [
        [a, c],
        [c, a],
      ])
        db.prepare(
          "UPDATE menu_days SET recipe_id=?,kind=?,variation_id=?,reason=? WHERE id=?",
        ).run(
          from.recipe_id,
          from.kind,
          from.variation_id || null,
          "Moved by Shani",
          target.id,
        );
      validateMenu(dayRows(m.id), allRecipes(db));
      invalidate(m.id);
    });
    res.json({ ok: true });
  });
  app.post("/api/menus/:id/approve", admin, (req, res) => {
    const m = getMenu(req.params.id);
    validateMenu(dayRows(m.id), allRecipes(db));
    db.prepare("UPDATE menus SET status='approved' WHERE id=?").run(m.id);
    res.json({ ok: true });
  });
  app.post("/api/menus/:id/tasks", admin, (req, res) => {
    const m = getMenu(req.params.id);
    const b = parse(
      z.object({
        recipeId: z.string(),
        date,
        portions: quantity,
        requestId: z.number().int().positive().nullable().optional(),
      }),
      req,
    );
    const recipe = allRecipes(db).find((r) => r.id === b.recipeId);
    if (!recipe || recipe.archived) fail("Choose an active recipe.");
    if (b.date < m.start_date || b.date > dayRows(m.id).at(-1).date)
      fail("Choose a date inside this menu.");
    if (b.requestId) {
      const request = db
        .prepare("SELECT * FROM requests WHERE id=?")
        .get(b.requestId);
      if (
        !request ||
        request.category !== "cooking" ||
        !["approved", "completed"].includes(request.status)
      )
        fail("Approve the cooking request first.");
    }
    transaction(db, () => {
      const previous = b.requestId
        ? db
            .prepare("SELECT menu_id FROM tasks WHERE request_id=?")
            .get(b.requestId)
        : null;
      db.prepare(
        "INSERT INTO tasks(menu_id,recipe_id,request_id,date,portions) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET menu_id=excluded.menu_id,recipe_id=excluded.recipe_id,date=excluded.date,portions=excluded.portions",
      ).run(m.id, b.recipeId, b.requestId || null, b.date, b.portions);
      if (previous) invalidate(previous.menu_id);
      invalidate(m.id);
    });
    res.json({ ok: true });
  });
  app.delete("/api/tasks/:id", admin, (req, res) => {
    const task = db
      .prepare("SELECT * FROM tasks WHERE id=?")
      .get(req.params.id);
    if (!task) fail("Task not found.", 404);
    transaction(db, () => {
      db.prepare("DELETE FROM tasks WHERE id=?").run(task.id);
      invalidate(task.menu_id);
    });
    res.json({ ok: true });
  });
  app.put("/api/pantry/:id", admin, (req, res) => {
    if (!ingredientDefinitions[req.params.id])
      fail("Unknown pantry ingredient.");
    const b = parse(z.object({ have: z.boolean() }), req);
    db.prepare(
      "INSERT INTO pantry VALUES(?,?) ON CONFLICT(ingredient_id) DO UPDATE SET have=excluded.have",
    ).run(req.params.id, Number(b.have));
    res.json({ ok: true });
  });
  app.put("/api/shopping/:menuId/state", (req, res) => {
    const m = getMenu(req.params.menuId);
    if (m.status !== "approved") fail("Shani must approve this menu first.");
    const b = parse(
      z.object({
        key: z.string().min(1).max(200),
        checked: z.boolean().optional(),
        have: z.boolean().optional(),
        purchaseQuantity: z.number().min(0).max(100000).nullable().optional(),
      }),
      req,
    );
    if (
      (b.have !== undefined || b.purchaseQuantity !== undefined) &&
      req.user.role !== "admin"
    )
      fail("Only Shani can edit grocery quantities or pantry decisions.", 403);
    const valid = shoppingList({
      menu: m,
      days: dayRows(m.id),
      tasks: db.prepare("SELECT * FROM tasks WHERE menu_id=?").all(m.id),
      recipes: allRecipes(db),
      manual: db.prepare("SELECT * FROM shopping_manual WHERE active=1").all(),
    }).some((x) => x.key === b.key);
    if (!valid) fail("Shopping item is not in this menu.");
    const old = db
      .prepare("SELECT * FROM shopping_state WHERE menu_id=? AND item_key=?")
      .get(m.id, b.key);
    db.prepare(
      "INSERT INTO shopping_state VALUES(?,?,?,?,?) ON CONFLICT(menu_id,item_key) DO UPDATE SET checked=excluded.checked,have=excluded.have,purchase_quantity=excluded.purchase_quantity",
    ).run(
      m.id,
      b.key,
      Number(b.checked ?? !!old?.checked),
      Number(b.have ?? !!old?.have),
      b.purchaseQuantity !== undefined
        ? b.purchaseQuantity
        : (old?.purchase_quantity ?? null),
    );
    res.json({ ok: true });
  });
  app.patch("/api/settings", admin, (req, res) => {
    const b = parse(
      z.object({ tacoDay: z.number().int().min(-1).max(6) }),
      req,
    );
    db.prepare("UPDATE settings SET value=? WHERE key='tacoDay'").run(
      JSON.stringify(b.tacoDay),
    );
    res.json({ ok: true });
  });
  app.post("/api/password", authLimit, (req, res) => {
    const b = parse(
      z.object({
        currentPassword: z.string().max(128),
        newPassword: z.string().min(8).max(128),
        userId: ids.optional(),
      }),
      req,
    );
    const self = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
    if (!passwordMatches(b.currentPassword, self.password_hash))
      fail("Current password is incorrect.", 403);
    const target = b.userId || self.id;
    if (target !== self.id && self.role !== "admin")
      fail("Only Shani can reset another profile.", 403);
    transaction(db, () => {
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        passwordHash(b.newPassword),
        target,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(target);
    });
    if (target === self.id) setSession(self.id, res);
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("/{*path}", (req, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    const status = error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      error:
        status === 500 ? "Something went wrong. Please retry." : error.message,
    });
  });
  return app;
}
