import { test, expect } from "@playwright/test";
test("three independent family sessions complete the core household workflow", async ({
  browser,
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Shani’s admin password")
    .fill("browser-admin-password");
  await page.getByLabel("James’s password").fill("browser-james-password");
  await page.getByLabel("Xander’s password").fill("browser-xander-password");
  await page.getByRole("button", { name: "Create our family kitchen" }).click();
  await expect(
    page.getByRole("heading", { name: "Good food. Better together." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".hero-image img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("home-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Family results" }).click();
  await page.getByRole("button", { name: "Open a new round" }).click();
  await page.getByLabel("Round name").fill("Browser acceptance week");
  await page.getByRole("button", { name: "Open voting" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const xContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const jamesContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const x = await xContext.newPage(),
    james = await jamesContext.newPage();
  for (const [p, name, password] of [
    [x, "Xander", "browser-xander-password"],
    [james, "James", "browser-james-password"],
  ] as const) {
    await p.goto("/");
    await p
      .getByRole("button", { name: new RegExp(name + " Family member") })
      .click();
    await p.getByLabel("Password", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Come on in" }).click();
    await expect(
      p.getByRole("heading", { name: "Good food. Better together." }),
    ).toBeVisible();
    await p.goto("/vote");
    await expect(p.locator(".swipe-card")).toBeVisible();
    await p.getByRole("button", { name: "YES PLEASE" }).click();
    await expect(p.getByText("1 of 10 dinners selected")).toBeVisible();
    await p.reload();
    await expect(p.getByText("1 of 10 dinners selected")).toBeVisible();
  }
  await x.screenshot({
    path: testInfo.outputPath("vote-mobile.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page
      .locator(".voter-card")
      .filter({ hasText: "Xander" })
      .getByText("1 YES · 0 MAYBE"),
  ).toBeVisible();
  await expect(
    page
      .locator(".voter-card")
      .filter({ hasText: "James" })
      .getByText("1 YES · 0 MAYBE"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Weekly menu" }).click();
  await page.getByRole("button", { name: "Plan a new week" }).click();
  await page.getByLabel("Menu name").fill("Browser family menu");
  await page.getByLabel("Starting").fill("2030-01-07");
  await page.getByLabel("Generate a provisional plan if someone is still voting").check();
  await page.getByRole("button", { name: "Generate my menu" }).click();
  await expect(page.locator(".menu-day")).toHaveCount(7);
  await page.getByRole("button", { name: "Edit 2030-01-07" }).click();
  await page.getByLabel("Generous portions", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save dinner" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve menu" }).click();
  await expect(page.getByText("Approved for the table")).toBeVisible();
  await x.goto("/requests");
  await x.getByLabel("Your requests").fill("Mom, please get 2 boxes of soda.");
  await x.getByRole("button", { name: "Send to the family" }).click();
  await expect(
    x.locator(".request-card").filter({ hasText: "2 boxes of soda" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Family requests/ }).click();
  let soda = page
    .locator(".request-card")
    .filter({ hasText: "2 boxes of soda" });
  await soda.getByRole("button", { name: "Approve", exact: true }).click();
  await soda.getByRole("button", { name: "Confirm & add to shopping" }).click();
  await page.getByLabel("Product / shopping note").fill("Soda");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await page
    .getByRole("button", { name: "Confirm & add", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await james.goto("/requests");
  await james.getByLabel("What kind of request?").selectOption("cooking");
  await james
    .getByLabel("Your requests")
    .fill("Please make cookies this week.");
  await james.getByRole("button", { name: "Send to the family" }).click();
  await expect(
    james.locator(".request-card").filter({ hasText: "Please make cookies" }),
  ).toBeVisible();
  await page.reload();
  let cookies = page
    .locator(".request-card")
    .filter({ hasText: "Please make cookies" });
  await cookies.getByRole("button", { name: "Approve", exact: true }).click();
  await cookies.getByRole("button", { name: "Schedule a recipe" }).click();
  await page.getByRole("button", { name: "Add to the plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Weekly menu" }).click();
  await expect(
    page.getByText("Brown Butter & Miso Chocolate Chip Cookies", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve menu" }).click();
  await page.getByRole("link", { name: "Shopping list" }).click();
  const sodaRow = page
    .locator(".shopping-row")
    .filter({ has: page.getByText("Soda", { exact: true }) });
  await expect(sodaRow.getByText("2 box", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Broccoli florets", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Gluten-free dark chocolate chips", { exact: true }),
  ).toBeVisible();
  await sodaRow.getByRole("checkbox").check();
  await expect(sodaRow.getByRole("checkbox")).toBeEnabled();
  await page.reload();
  await expect(sodaRow.getByRole("checkbox")).toBeChecked();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: testInfo.outputPath("shopping-list.pdf"),
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await expect(page.locator(".print-title")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("link", { name: "Weekly menu" }).click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: testInfo.outputPath("fridge-menu.pdf"),
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await expect(page.locator(".day-vegetables").first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("link", { name: "Recipe library" }).click();
  await page.getByLabel("Search recipes").fill("Crispy Salmon");
  await page
    .getByRole("button", { name: "Crispy Salmon Rice Bowls", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Protein: Salmon, skin-on center-cut fillets"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "More servings" }).click();
  await expect(
    dialog.locator(".ingredients").getByText("2 lb", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Start cooking" }).click();
  await dialog.locator(".cooking-steps input").first().check();
  await expect(dialog.locator(".cooking-steps label").first()).toHaveClass(
    "done",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await x.goto("/");
  await x.screenshot({
    path: testInfo.outputPath("home-mobile.png"),
    fullPage: true,
  });
  expect(
    await x.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("link", { name: "Family results" }).click();
  await page.getByRole("button", { name: "Open a new round" }).click();
  await page.getByLabel("Round name").fill("Another week");
  await page.getByRole("button", { name: "Open voting" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Voting round", { exact: true })
    .selectOption({ label: "Browser acceptance week · closed" });
  await expect(
    page
      .locator(".voter-card")
      .filter({ hasText: "Xander" })
      .getByText("1 YES · 0 MAYBE"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Weekly menu" }).click();
  await page.getByRole("button", { name: "Plan a new week" }).click();
  await page.getByLabel("Menu name").fill("Two-week fridge menu");
  await page.getByLabel("Starting").fill("2030-02-04");
  await page.getByLabel("Plan for").selectOption("14");
  await page.getByLabel("Generate a provisional plan if someone is still voting").check();
  await page.getByRole("button", { name: "Generate my menu" }).click();
  await expect(page.locator(".menu-day")).toHaveCount(14);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: testInfo.outputPath("fridge-menu-14-days.pdf"),
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
  await xContext.close();
  await jamesContext.close();
});

test("recipe options change cooking photos and approved shopping without mixing sauces", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-admin-password");
  await page.getByRole("button", { name: "Come on in" }).click();
  await expect(
    page.getByRole("heading", { name: "Good food. Better together." }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  const generated = await page.request.post("/api/menus/generate", {
    data: {
      title: "Recipe options check",
      startDate: "2030-03-04",
      days: 7,
      roundId: state.rounds[0].id,
      attendees: ["shani", "james", "xander"],
      portions: 3,
      leftovers: false,
            provisional: true,
    },
  });
  expect(generated.ok()).toBeTruthy();
  const { id: menuId } = await generated.json();
  const fresh = await (await page.request.get("/api/state")).json();
  const menu = fresh.menus.find((m: any) => m.id === menuId);
  for (const d of menu.days.slice(1)) {
    const r = await page.request.patch(`/api/menu-days/${d.id}`, {
      data: { kind: "out" },
    });
    expect(r.ok()).toBeTruthy();
  }
  await page.goto("/menu");
  await page.getByRole("button", { name: "Edit 2030-03-04" }).click();
  await page.getByLabel("Recipe", { exact: true }).selectOption("grilled-ribs");
  await page.getByLabel("Recipe option", { exact: true }).selectOption("asian");
  await page.getByRole("button", { name: "Save dinner" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const leftover = await page.request.patch(
    `/api/menu-days/${menu.days[1].id}`,
    { data: { kind: "leftover", leftoverOf: menu.days[0].id } },
  );
  expect(leftover.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Approve menu" }).click();
  await expect(page.getByText("Approved for the table")).toBeVisible();
  await page
    .locator(".menu-day")
    .first()
    .getByRole("button", { name: "Grilled Pork Ribs", exact: true })
    .click();
  const recipe = page.getByRole("dialog");
  await expect(recipe.getByLabel("Recipe option", { exact: true })).toHaveValue(
    "asian",
  );
  await expect(recipe.locator(".detail-photo img")).toHaveAttribute(
    "src",
    "/images/recipes/grilled-ribs-asian.webp",
  );
  await expect(
    recipe
      .locator(".ingredients")
      .getByText("Certified gluten-free gochujang", { exact: true }),
  ).toBeVisible();
  await expect(
    recipe
      .locator(".ingredients")
      .getByText("Gluten-free barbecue sauce", { exact: true }),
  ).toHaveCount(0);
  await recipe.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Shopping list" }).click();
  await expect(
    page.getByText("Certified gluten-free gochujang", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Gluten-free barbecue sauce", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Weekly menu" }).click();
  await page.getByRole("button", { name: "Edit 2030-03-04" }).click();
  await page
    .getByLabel("Recipe option", { exact: true })
    .selectOption("garlic-salt");
  await page.getByRole("button", { name: "Save dinner" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve menu" }).click();
  await expect(page.getByText("Approved for the table")).toBeVisible();
  const saved = await (await page.request.get("/api/state")).json();
  const updated = saved.menus.find((m: any) => m.id === menuId);
  expect(updated.days[0].variation_id).toBe("garlic-salt");
  expect(updated.days[1].variation_id).toBe("garlic-salt");
  await page.getByRole("link", { name: "Shopping list" }).click();
  await expect(
    page.getByText("Certified gluten-free gochujang", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Gluten-free barbecue sauce", { exact: true }),
  ).toHaveCount(0);
  const garlic = page
    .locator(".shopping-row")
    .filter({ has: page.getByText("Garlic cloves", { exact: true }) });
  await expect(garlic.getByText("12 each", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("rib-option-shopping.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Recipe library" }).click();
  await page.getByLabel("Search recipes").fill("Creamy Mushroom Chicken");
  await page
    .getByRole("button", {
      name: "Creamy Mushroom Chicken Thighs",
      exact: true,
    })
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("Dairy-free", { exact: true })).toBeVisible();
  await detail
    .getByLabel("Recipe option", { exact: true })
    .selectOption("regular-cream");
  await expect(
    detail.getByText("Contains dairy", { exact: true }),
  ).toBeVisible();
  await expect(
    detail
      .locator(".ingredients")
      .getByText("Heavy whipping cream", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.locator(".ingredients").getByText("Coconut cream", { exact: true }),
  ).toHaveCount(0);
  await detail.screenshot({
    path: testInfo.outputPath("mushroom-chicken-cream-option.png"),
  });
});

test('voting stops at ten YES, resumes after reload, and undo reopens the deck', async ({page})=>{
 await page.request.post('/api/login',{data:{userId:'shani',password:'browser-admin-password'}});
 await page.request.post('/api/rounds',{data:{title:'Ten-dinner browser check'}});
 await page.goto('/vote');
 await page.getByRole('button',{name:'MAYBE',exact:true}).click();
 await expect(page.getByText('0 of 10 dinners selected')).toBeVisible();
 for(let i=1;i<=10;i++) {
   await page.getByRole('button',{name:'YES PLEASE'}).click();
   await expect(page.getByText(`${i} of 10 dinners selected`)).toBeVisible();
   if(i===4) {await page.reload();await expect(page.getByText('4 of 10 dinners selected')).toBeVisible();}
 }
 await expect(page.locator('.swipe-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Undo last vote',exact:true}).click();
 await expect(page.getByText('9 of 10 dinners selected')).toBeVisible();
 await expect(page.locator('.swipe-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Finish Early',exact:true}).click();
 await page.reload();
 await expect(page.locator('.swipe-card')).toHaveCount(0);
});
