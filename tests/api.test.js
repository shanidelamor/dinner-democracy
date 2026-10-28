import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/node-db.js";
import { createApp } from "../server/app.js";
test("shared household acceptance workflows and authorization", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dinner-test-"));
  const filename = join(dir, "test.sqlite");
  // Set TEST_BASE_URL (and TEST_SETUP_KEY) to run this same suite against a
  // running Cloudflare Worker (for example `wrangler dev`) instead of Node.
  const remote = process.env.TEST_BASE_URL;
  let db = remote ? null : openDatabase(filename);
  let server = remote ? null : createApp(db).listen(0, "127.0.0.1");
  if (server) await new Promise((r) => server.on("listening", r));
  let base = remote || `http://127.0.0.1:${server.address().port}`;
  const cookies = {};
  const send = async (user, path, method = "GET", body, status = 200) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookies[user] ? { Cookie: cookies[user] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    if (r.headers.get("set-cookie"))
      cookies[user] = r.headers.get("set-cookie").split(";")[0];
    return data;
  };
  try {
    await t.test(
      "Shani initializes household, profile sessions are independent",
      async () => {
        await send("shani", "/setup", "POST", {
          adminPassword: "test-admin-password",
          jamesPassword: "test-james-password",
          xanderPassword: "test-xander-password",
          ...(process.env.TEST_SETUP_KEY
            ? { setupKey: process.env.TEST_SETUP_KEY }
            : {}),
        });
        await send("james", "/login", "POST", {
          userId: "james",
          password: "test-james-password",
        });
        await send("xander", "/login", "POST", {
          userId: "xander",
          password: "test-xander-password",
        });
        assert.notEqual(cookies.james, cookies.xander);
        await send("none", "/state", "GET", undefined, 401);
        await send("james", "/rounds", "POST", { title: "Not allowed" }, 403);
        await send("xander", "/settings", "PATCH", { tacoDay: 2 }, 403);
      },
    );
    let roundId;
    await t.test(
      "Shani opens a round; Xander and James vote independently and votes refresh",
      async () => {
        roundId = (
          await send("shani", "/rounds", "POST", {
            title: "Acceptance dinner vote",
          })
        ).id;
        for (const user of ["shani", "james", "xander"])
          await send(user, "/votes", "PUT", {
            roundId,
            recipeId: "sticky-chicken",
            choice: "yes",
          });
        await send("xander", "/votes", "PUT", {
          roundId,
          recipeId: "crispy-salmon",
          choice: "maybe",
        });
        const state = await send("shani", "/state");
        assert.equal(
          state.votes.filter(
            (v) =>
              v.round_id === roundId &&
              v.recipe_id === "sticky-chicken" &&
              v.choice === "yes",
          ).length,
          3,
        );
        const james = await send("james", "/state");
        assert.ok(james.votes.every((v) => v.user_id === "james"));
        assert.equal(state.rounds.length, 2);
      },
    );
    let menuId, firstDay;
    await t.test(
      "7-day menu is generated, edited, locked and approved; sides and servings scale",
      async () => {
        menuId = (
          await send("shani", "/menus/generate", "POST", {
            title: "Acceptance week",
            startDate: "2030-01-07",
            days: 7,
            roundId,
            attendees: ["shani", "james", "xander"],
            portions: 3,
            leftovers: false,
            provisional: true,
          })
        ).id;
        let state = await send("shani", "/state");
        const menu = state.menus.find((m) => m.id === menuId);
        assert.equal(menu.days.length, 7);
        firstDay = menu.days[0];
        assert.equal(firstDay.recipe_id, "sticky-chicken");
        assert.deepEqual(state.shoppingLists[menuId], []);
        await send("shani", `/menu-days/${firstDay.id}`, "PATCH", {
          portions: 6,
          locked: true,
        });
        await send("shani", `/menus/${menuId}/regenerate`, "POST", {});
        state = await send("shani", "/state");
        assert.equal(
          state.menus.find((m) => m.id === menuId).days[0].portions,
          6,
        );
        await send("shani", `/menus/${menuId}/approve`, "POST", {});
        state = await send("shani", "/state");
        assert.ok(
          state.shoppingLists[menuId].find((i) => i.ingredientId === "broccoli")
            .quantity >= 32,
        );
        assert.ok(
          state.shoppingLists[menuId].find((i) => i.ingredientId === "thigh")
            .quantity >= 48,
        );
        assert.equal((await send("xander", "/state")).menus.length, 1);
      },
    );
    let requestId;
    await t.test(
      "Xander requests two boxes of soda; Shani reviews and explicitly converts exact quantity",
      async () => {
        await send("xander", "/requests", "POST", {
          message: "Mom, please get 2 boxes of soda.\nVanilla ice cream.",
          category: "grocery",
        });
        let state = await send("shani", "/state");
        requestId = state.requests.find((r) => r.message.includes("soda")).id;
        assert.equal(
          state.requests.find((r) => r.id === requestId).quantity,
          2,
        );
        await send(
          "james",
          `/requests/${requestId}`,
          "PATCH",
          { message: "Edited by James" },
          403,
        );
        await send(
          "xander",
          `/requests/${requestId}`,
          "PATCH",
          { status: "approved" },
          403,
        );
        await send("shani", `/requests/${requestId}`, "PATCH", {
          status: "approved",
        });
        state = await send("shani", "/state");
        assert.ok(!state.shoppingLists[menuId].some((i) => i.name === "Soda"));
        for (let i = 0; i < 2; i++)
          await send("shani", "/shopping/manual", "POST", {
            menuId,
            name: "Soda",
            quantity: 2,
            unit: "box",
            section: "Beverages",
            requestId,
          });
        state = await send("shani", "/state");
        const soda = state.shoppingLists[menuId].filter(
          (i) => i.name === "Soda",
        );
        assert.equal(soda.length, 1);
        assert.equal(soda[0].quantity, 2);
        assert.equal(soda[0].unit, "box");
        await send("xander", `/shopping/${menuId}/state`, "PUT", {
          key: soda[0].key,
          checked: true,
        });
        assert.equal(
          (await send("shani", "/state")).shoppingLists[menuId].find(
            (i) => i.name === "Soda",
          ).checked,
          true,
        );
      },
    );
    await t.test(
      "James requests cookies; Shani schedules baking and ingredients join the approved list",
      async () => {
        await send("james", "/requests", "POST", {
          message: "Please make cookies this week.",
          category: "cooking",
        });
        const r = (await send("shani", "/state")).requests.find(
          (r) => r.category === "cooking",
        );
        await send("shani", `/requests/${r.id}`, "PATCH", {
          status: "approved",
        });
        await send("shani", `/menus/${menuId}/tasks`, "POST", {
          recipeId: "brown-butter-cookies",
          date: "2030-01-08",
          portions: 18,
          requestId: r.id,
        });
        assert.deepEqual(
          (await send("shani", "/state")).shoppingLists[menuId],
          [],
        );
        await send("shani", `/menus/${menuId}/approve`, "POST", {});
        assert.equal(
          (await send("shani", "/state")).shoppingLists[menuId].find(
            (i) => i.ingredientId === "chocolate",
          ).quantity,
          8,
        );
      },
    );
    await t.test(
      "new rounds preserve votes; undo is scoped to the signed-in profile",
      async () => {
        await send("xander", "/votes", "PUT", {
          roundId,
          recipeId: "crispy-salmon",
          choice: null,
        });
        assert.ok(
          !(await send("xander", "/state")).votes.some(
            (v) => v.recipe_id === "crispy-salmon",
          ),
        );
        await send("shani", "/rounds", "POST", { title: "Next week" });
        const s = await send("shani", "/state");
        assert.equal(
          s.votes.filter((v) => v.round_id === roundId && v.choice === "yes")
            .length,
          3,
        );
        await send(
          "james",
          "/votes",
          "PUT",
          { roundId, recipeId: "sticky-chicken", choice: "no" },
          400,
        );
      },
    );
    await t.test(
      remote
        ? "remote sessions and saved votes remain readable"
        : "database and sessions survive actual server shutdown and reopen",
      async () => {
        if (!remote) {
          await new Promise((r) => server.close(r));
          db.close();
          db = openDatabase(filename);
          server = createApp(db).listen(0, "127.0.0.1");
          await new Promise((r) => server.on("listening", r));
          base = `http://127.0.0.1:${server.address().port}`;
        }
        const s = await send("shani", "/state");
        assert.equal(s.votes.filter((v) => v.round_id === roundId).length, 3);
        assert.equal(
          s.shoppingLists[menuId].find((i) => i.name === "Soda").checked,
          true,
        );
        assert.equal(s.requests.find((r) => r.id === requestId).quantity, 2);
      },
    );
    await t.test(
      "cross-origin mutations, invalid dates, member quantity edits and seafood conflicts are rejected",
      async () => {
        const r = await fetch(base + "/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies.james,
            Origin: "https://evil.example",
          },
          body: JSON.stringify({ message: "bad", category: "grocery" }),
        });
        assert.equal(r.status, 403);
        await send(
          "shani",
          "/menus/generate",
          "POST",
          {
            title: "Bad date",
            startDate: "2030-02-30",
            days: 7,
            roundId,
            attendees: ["shani"],
            portions: 3,
            leftovers: false,
            provisional: true,
          },
          400,
        );
        await send(
          "james",
          `/shopping/${menuId}/state`,
          "PUT",
          { key: "manual:1", purchaseQuantity: 99 },
          403,
        );
        await send("shani", `/menu-days/${firstDay.id}`, "PATCH", {
          locked: false,
        });
        await send(
          "shani",
          `/menu-days/${firstDay.id}`,
          "PATCH",
          { recipeId: "crispy-salmon" },
          400,
        );
      },
    );
    await t.test(
      "recipe edits normalize ingredients, preserve history and invalidate grocery calculations",
      async () => {
        const state = await send("shani", "/state");
        const r = state.recipes.find((r) => r.id === "sticky-chicken");
        const item = {
          title: r.title,
          description: r.description,
          notes: "Family variation tested",
          steps: r.steps,
          ingredients: r.ingredients.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            unit: i.unit,
            note: i.note || "",
          })),
          madeBefore: true,
          favorite: true,
          servings: r.servings,
        };
        await send("shani", `/menus/${menuId}/approve`, "POST", {});
        await send("shani", `/shopping/${menuId}/state`, "PUT", {
          key: "thigh:weight",
          checked: true,
          purchaseQuantity: 100,
        });
        await send("james", `/recipes/${r.id}`, "PATCH", item, 403);
        await send(
          "shani",
          `/recipes/${r.id}`,
          "PATCH",
          {
            ...item,
            ingredients: item.ingredients.filter(
              (i) => !["broccoli", "cucumber"].includes(i.id),
            ),
          },
          400,
        );
        await send("shani", `/recipes/${r.id}`, "PATCH", {
          ...item,
          ingredients: item.ingredients.map((i) =>
            i.id === "broccoli" ? { ...i, quantity: 2 } : i,
          ),
        });
        let updated = await send("shani", "/state");
        assert.equal(updated.recipes.find((x) => x.id === r.id).version, 2);
        assert.deepEqual(updated.shoppingLists[menuId], []);
        assert.equal(
          (await send("shani", `/recipes/${r.id}/history`)).length,
          1,
        );
        await send("shani", `/menus/${menuId}/approve`, "POST", {});
        updated = await send("shani", "/state");
        assert.equal(
          updated.shoppingLists[menuId].find((i) => i.ingredientId === "thigh")
            .checked,
          false,
        );
        assert.equal(
          updated.shoppingLists[menuId].find((i) => i.ingredientId === "thigh")
            .purchaseQuantity,
          updated.shoppingLists[menuId].find(i=>i.ingredientId==="thigh").quantity,
        );
        assert.equal(
          updated.shoppingLists[menuId].find((i) => i.name === "Soda").checked,
          true,
        );
      },
    );
    await t.test(
      "Shani adds a complete recipe, the next round includes it, archive preserves prior votes",
      async () => {
        const state = await send("shani", "/state"),
          r = state.recipes.find((r) => r.id === "sticky-chicken");
        const body = {
          title: "Family test chicken",
          category: "Dinner",
          cuisine: "Family cooking",
          protein: "Chicken",
          cut: "Chicken thighs, boneless skinless",
          vegetables: "Broccoli",
          description: "Tested recipe entry",
          prep: 10,
          cook: 20,
          servings: 3,
          ingredients: r.ingredients.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            unit: i.unit,
          })),
          steps: r.steps,
          notes: "Tested",
          dairy: false,
          egg: false,
          glutenFree: true,
        };
        await send(
          "shani",
          "/recipes",
          "POST",
          { ...body, cut: "chicken" },
          400,
        );
        const created = await send("shani", "/recipes", "POST", body);
        const round = await send("shani", "/rounds", "POST", {
          title: "New recipe round",
        });
        assert.ok(
          (await send("shani", "/state")).rounds[0].recipeIds.includes(
            created.id,
          ),
        );
        await send("james", "/votes", "PUT", {
          roundId: round.id,
          recipeId: created.id,
          choice: "yes",
        });
        await send("shani", `/recipes/${created.id}/archive`, "PATCH", {
          archived: true,
        });
        const archived = await send("shani", "/state");
        assert.ok(!archived.rounds[0].recipeIds.includes(created.id));
        assert.ok(
          archived.votes.some(
            (v) => v.recipe_id === created.id && v.user_id === "james",
          ),
        );
        await send("shani", `/recipes/${created.id}/archive`, "PATCH", {
          archived: false,
        });
      },
    );
    await t.test(
      "14-day generator links safe leftovers and members cannot edit the plan",
      async () => {
        const latest = (await send("shani", "/state")).rounds[0];
        const m = await send("shani", "/menus/generate", "POST", {
          title: "Two-week plan",
          startDate: "2030-01-07",
          days: 14,
          roundId: latest.id,
          attendees: ["shani", "james", "xander"],
          portions: 3,
          leftovers: true,
          provisional: true,
        });
        const plan = (await send("shani", "/state")).menus.find(
          (x) => x.id === m.id,
        );
        assert.equal(plan.days.length, 14);
        assert.ok(
          plan.days.some((d) => d.kind === "leftover" && d.leftover_of),
        );
        await send(
          "james",
          `/menu-days/${plan.days[0].id}`,
          "PATCH",
          { portions: 9 },
          403,
        );
        await send("shani", `/menus/${m.id}/approve`, "POST", {});
        assert.ok(
          (await send("shani", "/state")).shoppingLists[m.id].length > 0,
        );
      },
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (db) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
