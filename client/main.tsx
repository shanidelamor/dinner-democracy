import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowLeft,
  Heart,
  Home,
  Check,
  X,
  HelpCircle,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  ShoppingBasket,
  MessageCircle,
  Utensils,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Search,
  Clock,
  Leaf,
  Users,
  Star,
  Printer,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Trash2,
  Pencil,
  ChefHat,
  CheckCircle2,
  Share2,
  Menu as MenuIcon,
  Sparkles,
  ShieldCheck,
  Sun,
  ClipboardList,
} from "lucide-react";
import {
  api,
  amount,
  formatQty,
  dayLabel,
  today,
  resolveRecipeView,
} from "./api";
import type {
  AppState,
  Recipe,
  FamilyRequest,
  Menu,
  Day,
  ShoppingItem,
} from "./types";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
type Ctx = {
  data: AppState;
  act: (
    path: string,
    method?: string,
    body?: unknown,
    message?: string,
  ) => Promise<any>;
  busy: boolean;
  openRecipe: (r: Recipe) => void;
  go: (path: string) => void;
  admin: boolean;
  notify: (message: string) => void;
};
const Context = createContext<Ctx>(null!);
const useApp = () => useContext(Context);
const paths = [
  ["/", "Home", Home],
  ["/vote", "Vote for dinner", Heart],
  ["/results", "Family results", BarChart3],
  ["/menu", "Weekly menu", CalendarDays],
  ["/recipes", "Recipe library", BookOpen],
  ["/shopping", "Shopping list", ShoppingBasket],
  ["/requests", "Family requests", MessageCircle],
  ["/settings", "Settings", Settings],
] as const;
const Person = ({ id, small = false }: { id: string; small?: boolean }) => (
  <span className={`avatar ${id} ${small ? "small" : ""}`}>
    {id.charAt(0).toUpperCase()}
  </span>
);
const Food = ({
  recipe,
  className = "",
}: {
  recipe: Recipe;
  className?: string;
}) => (
  <img
    className={`food-photo ${className}`}
    src={recipe.image}
    alt={recipe.imageAlt || recipe.title}
    loading="lazy"
    onError={(e) => {
      e.currentTarget.style.opacity = "0";
      e.currentTarget.parentElement?.classList.add("photo-fallback");
    }}
  />
);
const Badge = ({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) => <span className={`badge ${tone}`}>{children}</span>;
function Empty({
  icon: Icon = ChefHat,
  title,
  children,
  action,
}: {
  icon?: any;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={32} />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && el) {
        const items = [
          ...el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ),
        ].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function App() {
  const [data, setData] = useState<AppState | null>(null),
    [status, setStatus] = useState<{
      initialized: boolean;
      requiresSetupKey: boolean;
    } | null>(null),
    [path, setPath] = useState(location.pathname),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [recipe, setRecipe] = useState<Recipe | null>(null),
    [mobile, setMobile] = useState(false),
    [loadError, setLoadError] = useState("");
  const refresh = async () => {
    const s = await api("/status");
    setStatus(s);
    if (s.initialized) {
      try {
        setData(await api("/state"));
      } catch (e) {
        if ((e as Error).message !== "Please sign in.") throw e;
      }
    }
  };
  useEffect(() => {
    refresh().catch((e) => setLoadError(e.message));
    const expired = () => setData(null);
    window.addEventListener("session-expired", expired);
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    const poll = () =>
      api<AppState>("/state")
        .then(setData)
        .catch(() => {});
    const interval = setInterval(poll, 15000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [!!data]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const go = (p: string) => {
    history.pushState({}, "", p);
    setPath(p);
    setMobile(false);
    window.scrollTo({ top: 0 });
  };
  const act = async (
    p: string,
    method = "POST",
    body?: unknown,
    message?: string,
  ) => {
    setBusy(true);
    try {
      const r = await api(p, method, body);
      await refresh();
      if (message) setToast(message);
      return r;
    } catch (e) {
      setToast((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  if (loadError)
    return (
      <div className="auth-page">
        <Empty
          title="Couldn’t reach your kitchen"
          action={<button onClick={() => location.reload()}>Try again</button>}
        >
          {loadError}
        </Empty>
      </div>
    );
  if (!status)
    return (
      <div className="loading">
        <Utensils /> Opening the kitchen…
      </div>
    );
  if (!data)
    return (
      <Auth
        initialized={status.initialized}
        requiresSetupKey={status.requiresSetupKey}
        onSuccess={refresh}
      />
    );
  const ctx: Ctx = {
    data,
    act,
    busy,
    openRecipe: setRecipe,
    go,
    admin: data.user.role === "admin",
    notify: setToast,
  };
  const pending = data.requests.filter((r) => r.status === "pending").length;
  const current = paths.find((p) => p[0] === path) || paths[0];
  return (
    <Context.Provider value={ctx}>
      <div className="app-shell">
        <aside className={`sidebar ${mobile ? "open" : ""}`}>
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              go("/");
            }}
          >
            <span className="brand-mark">
              <Utensils size={24} />
              <Leaf size={13} />
            </span>
            <span>
              Dinner
              <br />
              <em>Democracy</em>
            </span>
          </a>
          <div className="sidebar-caption">YOUR FAMILY’S TABLE</div>
          <nav>
            {paths
              .filter((p) => p[0] !== "/results" || ctx.admin)
              .map(([p, name, Icon]) => (
                <a
                  href={p}
                  key={p}
                  className={path === p ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    go(p);
                  }}
                >
                  <Icon size={19} />
                  <span>{name}</span>
                  {p === "/requests" && pending > 0 && (
                    <span className="count">{pending}</span>
                  )}
                </a>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="family-note">
              <Leaf size={22} />
              <p>
                Good food.
                <br />
                <strong>Even better company.</strong>
              </p>
            </div>
            <button className="profile-button" onClick={() => go("/settings")}>
              <Person id={data.user.id} />
              <span>
                <strong>{data.user.name}</strong>
                <small>
                  {ctx.admin ? "Mom · kitchen captain" : "At the family table"}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
        {mobile && (
          <div className="sidebar-scrim" onClick={() => setMobile(false)} />
        )}
        <div className="main-wrap">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <MenuIcon />
              </button>
              <span className="breadcrumb">
                Our kitchen <ChevronRight size={13} />{" "}
                <strong>{current[1]}</strong>
              </span>
            </div>
            <div className="topbar-right">
              <span className="live-dot" />
              <span className="sync-label">Shared family kitchen</span>
              <div className="avatar-stack">
                {data.users.map((u) => (
                  <Person key={u.id} id={u.id} small />
                ))}
              </div>
            </div>
          </header>
          <main
            className={
              path === "/vote"
                ? "vote-main"
                : path === "/menu"
                  ? "menu-main"
                  : path === "/shopping"
                    ? "shopping-main"
                    : ""
            }
          >
            {path === "/" ? (
              <HomePage />
            ) : path === "/vote" ? (
              <VotePage />
            ) : path === "/recipes" ? (
              <RecipesPage />
            ) : path === "/results" ? (
              ctx.admin ? (
                <ResultsPage />
              ) : (
                <Empty title="Shani’s kitchen dashboard">
                  Family results are available to Shani.
                </Empty>
              )
            ) : path === "/requests" ? (
              <RequestsPage />
            ) : path === "/menu" ? (
              <MenuPage />
            ) : path === "/shopping" ? (
              <ShoppingPage />
            ) : path === "/settings" ? (
              <SettingsPage />
            ) : (
              <HomePage />
            )}
          </main>
          <footer className="app-footer">
            <span>Dinner Democracy</span>
            <span>Made for your family. One delicious decision at a time.</span>
            <Leaf size={14} />
          </footer>
        </div>
      </div>
      {recipe && (
        <RecipeDetail
          recipe={data.recipes.find((r) => r.id === recipe.id) || recipe}
          initialVariationId={recipe.selectedVariation}
          onClose={() => setRecipe(null)}
        />
      )}
      <div
        role="status"
        aria-live="polite"
        className={`toast ${toast ? "show" : ""}`}
      >
        {toast}
      </div>
    </Context.Provider>
  );
}
function Auth({
  initialized,
  requiresSetupKey,
  onSuccess,
}: {
  initialized: boolean;
  requiresSetupKey: boolean;
  onSuccess: () => Promise<void>;
}) {
  const [person, setPerson] = useState("shani"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (initialized)
        await api("/login", "POST", {
          userId: person,
          password: f.get("password"),
        });
      else await api("/setup", "POST", Object.fromEntries(f));
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-wordmark">
          <Utensils /> Dinner Democracy
        </div>
        <h1>
          Everyone gets
          <br />a seat.
          <br />
          <em>And a say.</em>
        </h1>
        <p>
          A little less deciding.
          <br />A lot more delicious.
        </p>
        <div className="auth-photo" />
        <small>YOUR FAMILY’S NEXT FAVORITE STARTS HERE.</small>
      </div>
      <div className="auth-content">
        <div className="eyebrow">
          <Leaf size={15} /> THE FAMILY TABLE
        </div>
        <h1>
          {initialized ? "Welcome to the kitchen." : "Let’s set your table."}
        </h1>
        <p className="muted">
          {initialized
            ? "Pick your profile and sign in. Dinner is a family decision."
            : "Create your shared family kitchen. These passwords protect each profile; Shani controls the menu and approvals."}
        </p>
        <form onSubmit={submit}>
          {initialized ? (
            <>
              <div className="profile-picker">
                {["shani", "james", "xander"].map((id) => (
                  <button
                    type="button"
                    key={id}
                    className={person === id ? "selected" : ""}
                    onClick={() => setPerson(id)}
                  >
                    <Person id={id} />
                    <strong>{id[0].toUpperCase() + id.slice(1)}</strong>
                    <small>
                      {id === "shani" ? "Mom / admin" : "Family member"}
                    </small>
                  </button>
                ))}
              </div>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  autoFocus
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Shani’s admin password
                <input
                  name="adminPassword"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </label>
              <div className="form-row">
                <label>
                  James’s password
                  <input
                    name="jamesPassword"
                    type="password"
                    required
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                </label>
                <label>
                  Xander’s password
                  <input
                    name="xanderPassword"
                    type="password"
                    required
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                </label>
              </div>
              {requiresSetupKey && (
                <label>
                  Hosting setup key
                  <input
                    name="setupKey"
                    type="password"
                    required
                    autoComplete="off"
                  />
                  <small>
                    The SETUP_KEY configured by the person hosting this app.
                  </small>
                </label>
              )}
              <p className="notice">
                <ShieldCheck size={17} /> Share each person’s password
                privately. All three profiles use this same shared database.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Opening the kitchen…"
              : initialized
                ? "Come on in"
                : "Create our family kitchen"}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="auth-foot">
          <Lock size={13} /> Your family’s recipes, votes and plans stay
          together.
        </div>
      </div>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
function RecipeCard({ r }: { r: Recipe }) {
  const { openRecipe, data, act } = useApp();
  return (
    <article className="recipe-card">
      <button className="recipe-photo-button" onClick={() => openRecipe(r)}>
        <Food recipe={r} />
        <span className="recipe-photo-badges">
          {r.favorite ? (
            <Badge tone="cream">
              <Star size={11} fill="currentColor" /> Family favorite
            </Badge>
          ) : (
            r.madeBefore === false && (
              <Badge tone="cream">New to our table</Badge>
            )
          )}
        </span>
      </button>
      <button
        className={`save-heart ${data.favorites.includes(r.id) ? "saved" : ""}`}
        aria-label={`${data.favorites.includes(r.id) ? "Unsave" : "Save"} ${r.title}`}
        onClick={() =>
          act(`/favorites/${r.id}`, "PUT", {
            favorite: !data.favorites.includes(r.id),
          }).catch(() => {})
        }
      >
        <Heart
          size={17}
          fill={data.favorites.includes(r.id) ? "currentColor" : "none"}
        />
      </button>
      <div className="recipe-card-body">
        <small>
          {r.cuisine} <span>·</span> {r.protein}
        </small>
        <button className="text-title" onClick={() => openRecipe(r)}>
          {r.title}
        </button>
        <div className="recipe-card-meta">
          <span>
            <Clock size={13} />
            {r.prep + r.cook} min
          </span>
          <span>
            <Leaf size={13} /> {r.glutenFree ? "Gluten-free" : "Review diet"}
          </span>
        </div>
      </div>
    </article>
  );
}
function HomePage() {
  const { data, go, admin, openRecipe } = useApp();
  const round = data.rounds.find((r) => r.status === "open");
  const own = data.votes.filter(
    (v) => v.round_id === round?.id && v.user_id === data.user.id,
  ).length;
  const featured = data.recipes.find((r) => r.id === "crispy-salmon")!;
  const favorites = data.recipes
    .filter((r) => r.category === "Dinner" && !r.archived)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .slice(0, 4);
  const menu = data.menus.find((m) => m.status === "approved");
  const upcoming = menu?.days.find((d) => d.date >= today());
  return (
    <>
      <div className="home-greeting">
        <span>
          <Sun size={17} /> A seat for everyone. A say for everyone.
        </span>
        <span>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="little-line" /> WELCOME TO YOUR FAMILY TABLE
          </div>
          <h1>
            Good food.
            <br />
            <em>Better together.</em>
          </h1>
          <p>
            The best dinners start with a little democracy.
            <br />
            Find what everyone’s craving. Make a plan.
            <br className="desktop-break" /> Bring something delicious to the
            table.
          </p>
          <button className="primary" onClick={() => go("/vote")}>
            Let’s pick dinner <ArrowRight size={18} />
          </button>
          <div className="hero-family">
            <div className="avatar-stack">
              {data.users.map((u) => (
                <Person key={u.id} id={u.id} small />
              ))}
            </div>
            <span>Three opinions. One happy table.</span>
          </div>
        </div>
        <div className="hero-image">
          <Food recipe={featured} />
          <div className="hero-photo-label">
            <span>
              <Star size={13} fill="currentColor" /> A FAMILY FAVORITE
            </span>
            <button onClick={() => openRecipe(featured)}>
              {featured.title}
              <ArrowRight size={19} />
            </button>
            <small>Crispy rice. Big flavor. Happy plates.</small>
          </div>
          <div className="hero-stamp">
            <Leaf size={20} />
            <span>
              Made with
              <br />
              <strong>everyone in mind</strong>
            </span>
          </div>
        </div>
      </section>
      <div className="quick-grid">
        <button className="quick-card" onClick={() => go("/vote")}>
          <span className="quick-icon peach">
            <Heart />
          </span>
          <div>
            <small>THIS ROUND</small>
            <h3>
              {round
                ? `${Math.max(0, round.recipeIds.length - own)} dinners to discover`
                : "Ready for a fresh round?"}
            </h3>
            <p>
              {round
                ? "Your next family favorite is one vote away."
                : "Shani can open your next dinner vote."}
            </p>
          </div>
          <ArrowRight size={18} />
        </button>
        <button className="quick-card" onClick={() => go("/menu")}>
          <span className="quick-icon sage">
            <CalendarDays />
          </span>
          <div>
            <small>AT THE TABLE</small>
            <h3>
              {upcoming
                ? upcoming.kind === "out"
                  ? "Taco night out!"
                  : data.recipes.find((r) => r.id === upcoming.recipe_id)?.title
                : "A good week starts here"}
            </h3>
            <p>
              {menu
                ? "Your approved family dinner plan."
                : "Build a balanced menu from everyone’s votes."}
            </p>
          </div>
          <ArrowRight size={18} />
        </button>
      </div>
      <button
        className="mobile-request-callout"
        onClick={() => go("/requests")}
      >
        <MessageCircle size={22} />
        <div>
          <small>FAMILY REQUESTS</small>
          <strong>Snacks? Cookies? Ask away.</strong>
        </div>
        <ArrowRight size={18} />
      </button>
      <div className="home-lower">
        <section>
          <div className="section-title">
            <div>
              <div className="eyebrow">TRIED, LOVED & WORTH A VOTE</div>
              <h2>Meet the dinner possibilities</h2>
            </div>
            <button className="text-link" onClick={() => go("/recipes")}>
              All recipes <ArrowRight size={15} />
            </button>
          </div>
          <div className="recipe-grid home-recipes">
            {favorites.map((r) => (
              <RecipeCard r={r} key={r.id} />
            ))}
          </div>
        </section>
        <aside className="requests-teaser">
          <div className="teaser-icon">
            <MessageCircle size={24} />
            <span>✦</span>
          </div>
          <div className="eyebrow">FAMILY REQUESTS</div>
          <h2>
            What’s on
            <br />
            your wish list?
          </h2>
          <p>More fruit? Your favorite snack? Cookies this week? Just ask.</p>
          <div className="request-example">
            “Mom, please get 2 boxes of soda.”
            <small>Every craving has a place.</small>
          </div>
          <button className="secondary full" onClick={() => go("/requests")}>
            {admin ? "Check family requests" : "Make a request"}
            <ArrowRight size={17} />
          </button>
          <small className="teaser-foot">
            {data.requests.filter((r) => r.status === "pending").length}{" "}
            requests waiting for a little love
          </small>
        </aside>
      </div>
      <div className="family-rules">
        <Leaf size={19} />
        <span>Gluten-free by default</span>
        <i />
        <span>A vegetable on every plate</span>
        <i />
        <span>Generous portions. Intentional leftovers.</span>
      </div>
    </>
  );
}
function VotePage() {
  const { data, act, busy, openRecipe } = useApp();
  const round = data.rounds.find((r) => r.status === "open");
  const [skips, setSkips] = useState<string[]>([]),
    [last, setLast] = useState<{
      id: string;
      choice: "yes" | "no" | "maybe" | null;
    } | null>(null),
    [review, setReview] = useState(false),
    [index, setIndex] = useState(0);
  const pointer = useRef<number | null>(null);
  const mine = data.votes.filter(
    (v) =>
      v.round_id === round?.id &&
      v.user_id === data.user.id &&
      round?.recipeIds.includes(v.recipe_id),
  );
  const all = (round?.recipeIds || []).map(id=>data.recipes.find(r=>r.id===id)).filter((r): r is Recipe=>!!r);
  const yesCount=mine.filter(v=>v.choice==='yes').length;
  const done=yesCount>=10 || !!round?.finishedUsers?.includes(data.user.id);
  const pool = review
    ? all.filter(r=>mine.some(v=>v.recipe_id===r.id))
    : all.filter((r) => !mine.some((v) => v.recipe_id === r.id));
  const deck = [
    ...pool.filter((r) => !skips.includes(r.id)),
    ...pool.filter((r) => skips.includes(r.id)),
  ];
  const batch=deck.slice(0,10);
  const card = done && !review ? undefined : review ? deck[index % Math.max(1,deck.length)] : batch[0];
  useEffect(() => {
    setSkips([]);
    setReview(false);
    setIndex(0);
    setLast(null);
  }, [round?.id]);
  async function vote(choice: "yes" | "no" | "maybe") {
    if (!card || !round || busy) return;
    const previous = mine.find((v) => v.recipe_id === card.id)?.choice || null;
    try {
      await act("/votes", "PUT", {
        roundId: round.id,
        recipeId: card.id,
        choice,
      });
      setLast({ id: card.id, choice: previous });
      if (review) setIndex((x) => x + 1);
    } catch {}
  }
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE DINNER DEMOCRACY"
        title="What sounds good?"
        description="Your own votes. Everyone’s next great dinner."
      >
        {round && <Badge tone="green">Voting is open</Badge>}
      </PageHeading>
      {!round ? (
        <Empty icon={Heart} title="The table is waiting">
          Shani can open a new voting round in Family results.
        </Empty>
      ) : (
        <>
          <div className="vote-progress">
            <div>
              <strong>{round.title}</strong>
              <span>
                {yesCount} of 10 dinners selected · {round.season || "Current round"}
              </span>
            </div>
            <div className="progress-track">
              <span
                style={{
                  width: `${Math.min(1, yesCount / 10) * 100}%`,
                }}
              />
            </div>
          </div>
          <button disabled={busy || done} onClick={()=>act(`/rounds/${round.id}/finish`,"POST",{}).catch(()=>{})}>Finish Early</button>
          {last && !card && <button onClick={()=>act("/votes","PUT",{roundId:round.id,recipeId:last.id,choice:last.choice}).then(()=>setLast(null)).catch(()=>{})}>Undo last vote</button>}
          {!card ? (
            <Empty
              icon={CheckCircle2}
              title="Your vote is at the table!"
              action={
                <button
                  className="primary"
                  onClick={() => {
                    setReview(true);
                    setIndex(0);
                  }}
                >
                  Review my votes
                </button>
              }
            >
              Every choice is saved. Shani can now see what you’re craving.
            </Empty>
          ) : (
            <div className="swipe-layout">
              <div className="swipe-hint">
                <Sparkles size={18} />
                <h3>Go with your gut.</h3>
                <p>
                  Swipe right for YES,
                  <br />
                  left for NO.
                  <br />
                  Feeling undecided?
                  <br />
                  There’s a MAYBE for that.
                </p>
                <small>
                  Tap a button if swiping
                  <br />
                  isn’t your thing.
                </small>
              </div>
              <div className="swipe-column">
                <article
                  className="swipe-card"
                  onPointerDown={(e) => (pointer.current = e.clientX)}
                  onPointerUp={(e) => {
                    if (pointer.current !== null) {
                      const diff = e.clientX - pointer.current;
                      if (diff > 100) vote("yes");
                      if (diff < -100) vote("no");
                      pointer.current = null;
                    }
                  }}
                >
                  <div className="swipe-photo">
                    <Food recipe={card} />
                    <div className="swipe-badges">
                      <Badge tone="cream">
                        {card.favorite
                          ? "★ Family favorite"
                          : card.madeBefore === false
                            ? "New to our table"
                            : "Recipe to review"}
                      </Badge>
                      <button
                        className="save-heart"
                        aria-label="Save as favorite"
                        onClick={() =>
                          act(`/favorites/${card.id}`, "PUT", {
                            favorite: !data.favorites.includes(card.id),
                          }).catch(() => {})
                        }
                      >
                        <Heart
                          size={19}
                          fill={
                            data.favorites.includes(card.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                    <span className="cuisine-label">{card.cuisine}</span>
                  </div>
                  <div className="swipe-body">
                    <h2>{card.title}</h2>
                    <p>{card.description}</p>
                    <div className="swipe-meta">
                      <span>
                        <Clock size={16} />
                        {card.prep + card.cook} min
                      </span>
                      <span>
                        <Leaf size={16} />
                        Gluten-free
                      </span>
                      <span>
                        <Users size={16} />
                        {card.servings} generous servings
                      </span>
                    </div>
                    <div className="meal-details">
                      <span>
                        <strong>PROTEIN</strong>
                        {card.cut}
                      </span>
                      <span>
                        <strong>ON THE SIDE</strong>
                        {card.vegetables}
                      </span>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => openRecipe(card)}
                    >
                      See the full recipe <ArrowRight size={15} />
                    </button>
                    {mine.find((v) => v.recipe_id === card.id) && (
                      <Badge>
                        Your vote:{" "}
                        {mine
                          .find((v) => v.recipe_id === card.id)
                          ?.choice.toUpperCase()}
                      </Badge>
                    )}
                    {data.user.id === "james" &&
                      ["Fish", "Shrimp"].includes(card.protein) && (
                        <p className="notice">
                          Seafood can stay for Shani and Xander. The planner
                          won’t select it when you’re attending.
                        </p>
                      )}
                  </div>
                </article>
                <div className="vote-actions">
                  <button
                    className="vote-no"
                    disabled={busy}
                    onClick={() => vote("no")}
                  >
                    <X />
                    <span>NO THANKS</span>
                  </button>
                  <button
                    className="vote-maybe"
                    disabled={busy}
                    onClick={() => vote("maybe")}
                  >
                    <HelpCircle />
                    <span>MAYBE</span>
                  </button>
                  <button
                    className="vote-yes"
                    disabled={busy}
                    onClick={() => vote("yes")}
                  >
                    <Heart />
                    <span>YES PLEASE</span>
                  </button>
                </div>
                <div className="vote-utilities">
                  <button
                    disabled={!last || busy}
                    onClick={async () => {
                      if (last)
                        try {
                          await act("/votes", "PUT", {
                            roundId: round.id,
                            recipeId: last.id,
                            choice: last.choice,
                          });
                          setLast(null);
                        } catch {}
                    }}
                  >
                    <RotateCcw size={15} /> Undo last vote
                  </button>
                  <button
                    onClick={() => {
                      if (review) setIndex((x) => x + 1);
                      else
                        setSkips((x) => [
                          ...x.filter((s) => s !== card.id),
                          card.id,
                        ]);
                    }}
                  >
                    Skip for now <ChevronRight size={15} />
                  </button>
                </div>
                <button
                  className="text-link centered"
                  onClick={() => {
                    setReview(!review);
                    setIndex(0);
                  }}
                >
                  {review
                    ? "Back to unvoted dinners"
                    : "Review or change my saved votes"}
                </button>
              </div>
              <div className="vote-side-note">
                <Leaf size={22} />
                <p>
                  Big flavors.
                  <br />
                  No bell peppers.
                  <br />
                  Always a vegetable.
                </p>
                <span>
                  That’s our kind
                  <br />
                  of family dinner.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
function RecipesPage() {
  const { data, admin } = useApp();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All dinners");
  const filters = [
    "All dinners",
    "Family favorites",
    "New for fall",
    "Saved by me",
    "Lunch & leftovers",
    "Side",
    "Baking",
    "Archived",
  ];
  const filtered = data.recipes.filter(
    (r) =>
      (filter === "Archived" || !r.archived) &&
      (filter === "All dinners"
        ? r.category === "Dinner" && !r.archived
        : filter === "Family favorites"
          ? r.favorite
          : filter === "New for fall"
            ? r.tags.includes("New for fall")
            : filter === "Saved by me"
              ? data.favorites.includes(r.id)
              : filter === "Archived"
                ? r.archived
                : r.category === filter) &&
      `${r.title} ${r.cut} ${r.cuisine} ${r.vegetables}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="THE FAMILY RECIPE BOX"
        title="A little inspiration for dinner."
        description="Familiar favorites, fresh possibilities, and all the details you need."
      >
        {admin && (
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add a family recipe
          </button>
        )}
      </PageHeading>
      <div className="library-toolbar">
        <div className="tabs">
          {filters.map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search recipes"
            placeholder="Find a recipe or ingredient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="library-count">
        {filtered.length} recipes <span>·</span> Prior methods are marked as
        reconstructions for Shani to review.
      </p>
      <div className="recipe-grid library-grid">
        {filtered.map((r) => (
          <RecipeCard key={r.id} r={r} />
        ))}
      </div>
      {!filtered.length && (
        <Empty icon={Search} title="Nothing in this corner yet">
          Try a different search or category.
        </Empty>
      )}
      {adding && <NewRecipe onClose={() => setAdding(false)} />}
    </>
  );
}
function ResultsPage() {
  const { data, act, busy, go } = useApp();
  const [roundId, setRoundId] = useState(data.rounds[0]?.id || 0),
    [create, setCreate] = useState(false),
    [filter, setFilter] = useState("All recipes");
  const round = data.rounds.find((r) => r.id === roundId) || data.rounds[0];
  const votes = data.votes.filter(
    (v) => v.round_id === round?.id && round?.recipeIds.includes(v.recipe_id),
  );
  const ranked = data.recipes
    .filter((r) => round?.recipeIds.includes(r.id))
    .map((r) => ({
      r,
      yes: votes.filter((v) => v.recipe_id === r.id && v.choice === "yes")
        .length,
      maybe: votes.filter((v) => v.recipe_id === r.id && v.choice === "maybe")
        .length,
      cast: votes.filter((v) => v.recipe_id === r.id).length,
    }))
    .filter((x) =>
      filter === "Everyone says YES"
        ? x.yes === 3
        : filter === "Two say YES"
          ? x.yes === 2
          : filter === "One says YES"
            ? x.yes === 1
            : filter === "Maybe votes"
              ? x.maybe > 0
              : filter === "No YES yet"
                ? x.yes === 0
                : true,
    )
    .sort(
      (a, b) =>
        Number(b.yes===3)-Number(a.yes===3) ||
        (b.yes*3+b.maybe)-(a.yes*3+a.maybe) ||
        a.r.title.localeCompare(b.r.title),
    );
  return (
    <>
      <PageHeading
        eyebrow="EVERY OPINION COUNTS"
        title="Find your common cravings."
        description="A missing vote is still undecided. It never counts as a no."
      >
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={17} /> Open a new round
        </button>
      </PageHeading>
      <div className="round-toolbar">
        <label>
          Voting round
          <select
            aria-label="Voting round"
            value={round?.id || ""}
            onChange={(e) => setRoundId(Number(e.target.value))}
          >
            {data.rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.status}
              </option>
            ))}
          </select>
        </label>
        {round && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              act(
                `/rounds/${round.id}`,
                "PATCH",
                { status: round.status === "open" ? "closed" : "open" },
                "Voting round updated",
              ).catch(() => {})
            }
          >
            {round.status === "open" ? "Close voting" : "Reopen this round"}
          </button>
        )}
        <button className="text-link" onClick={() => go("/menu")}>
          Make a menu <ArrowRight size={16} />
        </button>
      </div>
      <div className="voter-grid">
        {data.users.map((u) => {
          const cast = votes.filter((v) => v.user_id === u.id);
          return (
            <div className="panel voter-card" key={u.id}>
              <Person id={u.id} />
              <div>
                <h3>{u.name}</h3>
                <p>
                  {cast.filter((v) => v.choice === "yes").length} YES ·{" "}
                  {cast.filter((v) => v.choice === "maybe").length} MAYBE
                </p>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.min(1, cast.filter(v=>v.choice==="yes").length/10) * 100}%`,
                    }}
                  />
                </div>
                <small>
                  {cast.filter(v=>v.choice==="yes").length} / 10 dinners selected{" "}
                  {(cast.filter(v=>v.choice==="yes").length>=10 || round?.finishedUsers?.includes(u.id) || cast.length === round?.recipeIds.length)
                    ? "· All done!"
                    : "· Still deciding"}
                </small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="tabs spaced">
        {[
          "All recipes",
          "Everyone says YES",
          "Two say YES",
          "One says YES",
          "Maybe votes",
          "No YES yet",
        ].map((f) => (
          <button
            className={filter === f ? "active" : ""}
            key={f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="results-list">
        <div className="results-row results-head">
          <span>DINNER POSSIBILITIES</span>
          {data.users.map((u) => (
            <span key={u.id}>{u.name}</span>
          ))}
          <span>SCORE</span>
        </div>
        {ranked.map(({ r, yes, maybe }) => (
          <div className="results-row" key={r.id}>
            <button className="result-recipe" onClick={() => go("/recipes")}>
              <Food recipe={r} />
              <span>
                <strong>{r.title} · {yes*3+maybe} points</strong>
                <small>{r.cut}</small>
              </span>
            </button>
            {data.users.map((u) => {
              const vote = votes.find(
                (v) => v.recipe_id === r.id && v.user_id === u.id,
              );
              return (
                <span
                  key={u.id}
                  className={`result-choice ${vote?.choice || "unvoted"}`}
                >
                  {vote?.choice === "yes" ? (
                    <Check size={15} />
                  ) : vote?.choice === "no" ? (
                    <X size={15} />
                  ) : vote?.choice === "maybe" ? (
                    <HelpCircle size={15} />
                  ) : null}
                  {vote ? vote.choice.toUpperCase() : "Unvoted"}
                </span>
              );
            })}
            <Badge tone={yes === 3 ? "green" : yes === 2 ? "peach" : ""}>
              {yes*3+maybe} points · {yes} / 3 YES
            </Badge>
          </div>
        ))}
      </div>
      {!ranked.length && (
        <Empty icon={BarChart3} title="No matches here yet">
          Try another filter or invite everyone to vote.
        </Empty>
      )}
      {create && (
        <Modal
          title="A fresh round of possibilities"
          onClose={() => setCreate(false)}
        >
          <p className="muted">
            Past votes stay saved. Opening a new round closes the current round
            and starts fresh votes for active dinner recipes.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await act(
                  "/rounds",
                  "POST",
                  { title: f.get("title") },
                  "New voting round is open",
                );
                setRoundId(r.id);
                setCreate(false);
              } catch {}
            }}
          >
            <label>
              Round name
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={`Dinner picks · ${dayLabel(today(), { month: "short", day: "numeric" })}`}
              />
            </label>
            <button className="primary full" disabled={busy}>
              Open voting <Heart size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
const storeSections = [
  "Produce",
  "Meat and seafood",
  "Dairy and refrigerated",
  "Frozen",
  "Pantry and dry goods",
  "Bakery / gluten-free",
  "Beverages",
  "Other",
];
function AddShopping({
  request,
  onClose,
  menuId,
}: {
  request?: FamilyRequest;
  onClose: () => void;
  menuId?: number;
}) {
  const { data, act, busy } = useApp();
  const menus = data.menus.filter((m) => m.status === "approved");
  return (
    <Modal
      title={
        request ? "Confirm this grocery request" : "Add to the shopping list"
      }
      onClose={onClose}
    >
      {!menus.length ? (
        <Empty icon={ShoppingBasket} title="A menu comes first">
          Create and approve a menu, then add groceries to its shopping list.
          Your request is saved.
        </Empty>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act(
                "/shopping/manual",
                "POST",
                {
                  menuId: Number(f.get("menuId")),
                  name: f.get("name"),
                  quantity: Number(f.get("quantity")),
                  unit: f.get("unit"),
                  section: f.get("section"),
                  requestId: request?.id || null,
                  ingredientId: f.get("ingredientId") || null,
                },
                "Added to the shared shopping list",
              );
              onClose();
            } catch {}
          }}
        >
          <label>Combine with a catalog ingredient (optional)<select name="ingredientId"><option value="">Keep as a separate product</option>{data.ingredientCatalog.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          <p className="notice">
            Confirm the product and quantity. Similar requests stay separate so
            nothing gets silently combined.
          </p>
          <label>
            For this approved menu
            <select name="menuId" defaultValue={menuId || menus[0].id}>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product / shopping note
            <input
              name="name"
              required
              maxLength={250}
              defaultValue={request?.message || ""}
            />
          </label>
          <div className="form-row">
            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                required
                defaultValue={request?.quantity || 1}
              />
            </label>
            <label>
              Unit
              <select name="unit" defaultValue={request?.unit || "each"}>
                {[
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
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Trader Joe’s section
            <select
              name="section"
              defaultValue={
                /soda|water|juice/i.test(request?.message || "")
                  ? "Beverages"
                  : "Other"
              }
            >
              {storeSections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button className="primary full" disabled={busy}>
            Confirm & add <ShoppingBasket size={17} />
          </button>
        </form>
      )}
    </Modal>
  );
}
function ScheduleTask({
  request,
  menu,
  onClose,
}: {
  request?: FamilyRequest;
  menu?: Menu;
  onClose: () => void;
}) {
  const { data, act, busy } = useApp();
  const [mid, setMid] = useState(menu?.id || data.menus[0]?.id || 0);
  const [rid, setRid] = useState("brown-butter-cookies");
  const selected = data.menus.find((m) => m.id === mid);
  const r = data.recipes.find((r) => r.id === rid);
  return (
    <Modal title="Make room for something extra" onClose={onClose}>
      {!selected ? (
        <Empty icon={CalendarDays} title="Create a menu first">
          This request is saved. Once there’s a menu, schedule baking, a lunch
          or another dish here.
        </Empty>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await act(
                `/menus/${mid}/tasks`,
                "POST",
                {
                  recipeId: rid,
                  date: f.get("date"),
                  portions: Number(f.get("portions")),
                  requestId: request?.id || null,
                },
                "Scheduled. Review and approve the updated menu.",
              );
              onClose();
            } catch {}
          }}
        >
          <p className="muted">
            {request
              ? `Requested: “${request.message}”`
              : "Baking, lunches and extra dishes are separate from dinner."}{" "}
            Ingredients will be included after menu approval.
          </p>
          <label>
            Menu
            <select
              value={mid}
              onChange={(e) => setMid(Number(e.target.value))}
            >
              {data.menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recipe
            <select value={rid} onChange={(e) => setRid(e.target.value)}>
              {data.recipes
                .filter((r) => !r.archived)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {r.category}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Date
              <input
                key={mid}
                name="date"
                type="date"
                required
                min={selected.start_date}
                max={selected.days.at(-1)?.date}
                defaultValue={selected.start_date}
              />
            </label>
            <label>
              {r?.category === "Baking"
                ? "Number of cookies"
                : "Generous portions"}
              <input
                key={rid}
                name="portions"
                type="number"
                min="0.5"
                max="1000"
                step="0.5"
                defaultValue={r?.servings || 3}
                required
              />
            </label>
          </div>
          {r?.category === "Lunch & leftovers" && (
            <p className="notice">
              Standalone lunches include their full ingredient list, including
              prepared protein. To reserve portions of an existing dinner
              without buying twice, use “Use leftovers” on a menu day.
            </p>
          )}
          <button className="primary full" disabled={busy}>
            Add to the plan <CalendarDays size={17} />
          </button>
        </form>
      )}
    </Modal>
  );
}
function RequestsPage() {
  const { data, act, busy, admin } = useApp();
  const [filter, setFilter] = useState("All requests"),
    [shopping, setShopping] = useState<FamilyRequest | null>(null),
    [task, setTask] = useState<FamilyRequest | null>(null),
    [editing, setEditing] = useState<FamilyRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(
        /\b(please|mom|get|want|can|we|have|more|\d+|boxes|box|of|some|a|the)\b/g,
        "",
      )
      .replace(/[^a-z]/g, "");
  const filtered = data.requests.filter((r) =>
    filter === "All requests"
      ? true
      : filter === "Mine"
        ? r.user_id === data.user.id
        : filter === "Grocery"
          ? r.category === "grocery"
          : filter === "Cooking"
            ? r.category === "cooking"
            : r.status === "pending",
  );
  return (
    <>
      <PageHeading
        eyebrow="LITTLE REQUESTS, HAPPY PEOPLE"
        title="What are you craving?"
        description="Snacks, dinner ideas, or a batch of cookies. There’s room for every request."
      />
      <div className="requests-layout">
        <div>
          <div className="tabs spaced">
            {["All requests", "Pending", "Mine", "Grocery", "Cooking"].map(
              (f) => (
                <button
                  key={f}
                  className={filter === f ? "active" : ""}
                  onClick={() => setFilter(f)}
                >
                  {f}
                  {f === "Pending" && (
                    <span className="tab-count">
                      {
                        data.requests.filter((r) => r.status === "pending")
                          .length
                      }
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
          <div className="request-list">
            {filtered.map((r) => {
              const owner = data.users.find((u) => u.id === r.user_id);
              const duplicate = data.requests.some(
                (x) =>
                  x.id !== r.id &&
                  x.category === r.category &&
                  !["declined", "completed"].includes(x.status) &&
                  normalize(x.message) === normalize(r.message),
              );
              const added = data.shoppingManual.some(
                (m) => m.request_id === r.id,
              );
              const scheduled = data.menus.some((m) =>
                m.tasks.some((t) => t.request_id === r.id),
              );
              return (
                <article className="request-card panel" key={r.id}>
                  <div className="request-card-top">
                    <div className="person-inline">
                      <Person id={r.user_id} small />
                      <strong>{owner?.name}</strong>
                      <small>
                        {new Date(
                          r.created_at.replace(" ", "T") + "Z",
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                    </div>
                    <Badge
                      tone={
                        r.status === "approved" || r.status === "completed"
                          ? "green"
                          : r.status === "declined"
                            ? ""
                            : "peach"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="request-message">{r.message}</p>
                  <div className="request-metadata">
                    <span>
                      {r.category === "grocery" ? (
                        <ShoppingBasket size={13} />
                      ) : (
                        <ChefHat size={13} />
                      )}{" "}
                      {r.category === "grocery"
                        ? "Grocery request"
                        : "Cooking request"}
                    </span>
                    {r.quantity !== null && (
                      <strong>
                        {r.quantity} {r.unit} requested
                      </strong>
                    )}
                    {duplicate && (
                      <Badge tone="peach">
                        Similar request · review quantities
                      </Badge>
                    )}
                    {added && <Badge tone="green">Added to shopping</Badge>}
                    {scheduled && <Badge tone="green">Scheduled in menu</Badge>}
                  </div>
                  <div className="request-controls">
                    {admin && r.status === "pending" && (
                      <>
                        <button
                          className="small-button green"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/requests/${r.id}`,
                              "PATCH",
                              { status: "approved" },
                              "Request approved",
                            ).catch(() => {})
                          }
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          className="small-button"
                          disabled={busy}
                          onClick={() =>
                            act(`/requests/${r.id}`, "PATCH", {
                              status: "declined",
                            }).catch(() => {})
                          }
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {admin && r.status === "approved" && (
                      <>
                        <button
                          className="small-button green"
                          onClick={() =>
                            r.category === "grocery"
                              ? setShopping(r)
                              : setTask(r)
                          }
                        >
                          {r.category === "grocery" ? (
                            <ShoppingBasket size={14} />
                          ) : (
                            <CalendarDays size={14} />
                          )}{" "}
                          {r.category === "grocery"
                            ? added
                              ? "Update shopping entry"
                              : "Confirm & add to shopping"
                            : scheduled
                              ? "Update schedule"
                              : "Schedule a recipe"}
                        </button>
                        <button
                          className="small-button"
                          disabled={busy}
                          onClick={() =>
                            act(`/requests/${r.id}`, "PATCH", {
                              status: "completed",
                            }).catch(() => {})
                          }
                        >
                          Mark completed
                        </button>
                        <button
                          className="small-button"
                          onClick={() =>
                            act(
                              `/requests/${r.id}`,
                              "PATCH",
                              { status: "declined" },
                              "Request declined and linked entry removed",
                            ).catch(() => {})
                          }
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {admin && ["completed", "declined"].includes(r.status) && (
                      <button
                        className="small-button"
                        onClick={() =>
                          act(`/requests/${r.id}`, "PATCH", {
                            status: "pending",
                          }).catch(() => {})
                        }
                      >
                        Reopen request
                      </button>
                    )}
                    {r.user_id === data.user.id && r.status === "pending" && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Edit request ${r.message}`}
                          onClick={() => setEditing(r)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete request ${r.message}`}
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/requests/${r.id}`,
                              "DELETE",
                              {},
                              "Request deleted",
                            ).catch(() => {})
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {!filtered.length && (
              <Empty icon={MessageCircle} title="A little quiet at the table">
                Be the first to ask for something delicious.
              </Empty>
            )}
          </div>
        </div>
        <aside>
          <form
            ref={formRef}
            className="panel request-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              try {
                await act(
                  "/requests",
                  "POST",
                  { message: f.get("message"), category: f.get("category") },
                  "Your request is at the table",
                );
                form.reset();
              } catch {}
            }}
          >
            <span className="quick-icon peach">
              <MessageCircle />
            </span>
            <h2>Ask away.</h2>
            <p>One item per line. Include a quantity if you know it.</p>
            <label>
              What kind of request?
              <select name="category">
                <option value="grocery">Something to buy</option>
                <option value="cooking">Something to cook</option>
              </select>
            </label>
            <label>
              Your requests
              <textarea
                name="message"
                required
                maxLength={3000}
                rows={6}
                placeholder={
                  "2 boxes of soda\nVanilla ice cream\nMore strawberries, please"
                }
              />
            </label>
            <button className="primary full" disabled={busy}>
              Send to the family <ArrowRight size={16} />
            </button>
            <small>
              Shani gives the final thumbs-up. Requests are never automatically
              purchased.
            </small>
          </form>
        </aside>
      </div>
      {shopping && (
        <AddShopping request={shopping} onClose={() => setShopping(null)} />
      )}{" "}
      {task && <ScheduleTask request={task} onClose={() => setTask(null)} />}{" "}
      {editing && (
        <Modal title="Edit your request" onClose={() => setEditing(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await act(
                  `/requests/${editing.id}`,
                  "PATCH",
                  { message: f.get("message") },
                  "Request updated",
                );
                setEditing(null);
              } catch {}
            }}
          >
            <label>
              Your message
              <textarea
                name="message"
                required
                maxLength={1000}
                defaultValue={editing.message}
              />
            </label>
            <button className="primary full" disabled={busy}>
              Save changes
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function GenerateMenu({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { data, act, busy } = useApp();
  const [planLength,setPlanLength]=useState(7);
  return (
    <Modal title="A delicious week, planned together" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await act(
              "/menus/generate",
              "POST",
              {
                title: f.get("title"),
                startDate: f.get("startDate"),
                days: Number(f.get("days")),
                roundId: Number(f.get("roundId")),
                attendees: f.getAll("attendees"),
                portions: Number(f.get("portions")),
                leftovers: f.get("leftovers") === "on",
                provisional: f.get("provisional") === "on",
                schedule: f.get('customSchedule')==='on' ? Array.from({length:Number(f.get('days'))},(_,offset)=>({offset,home:f.get(`home-${offset}`)==='on',attendees:f.getAll(`people-${offset}`),portions:Number(f.get(`servings-${offset}`))})) : undefined,
              },
              "Your draft menu is ready to review",
            );
            onCreated(r.id);
            onClose();
          } catch {}
        }}
      >
        <label>
          Menu name
          <input
            name="title"
            required
            maxLength={120}
            defaultValue="Our week at the table"
          />
        </label>
        <div className="form-row">
          <label>
            Starting
            <input
              name="startDate"
              type="date"
              required
              defaultValue={today()}
            />
          </label>
          <label>
            Plan for
            <select name="days" onChange={e=>setPlanLength(Number(e.target.value))}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
            </select>
          </label>
        </div>
        <label><input type="checkbox" name="provisional" /> Generate a provisional plan if someone is still voting</label>
        <label>
          Use these family votes
          <select name="roundId">
            {data.rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            Generous portions / day
            <input
              name="portions"
              required
              type="number"
              min="0.5"
              max="1000"
              step="0.5"
              defaultValue="3"
            />
          </label>
          <fieldset>
            <legend>Normally attending</legend>
            <div className="check-row">
              {data.users.map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    name="attendees"
                    value={u.id}
                    defaultChecked
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <details><summary>Choose home dinners, attendance and servings for each day</summary><label><input type="checkbox" name="customSchedule" /> Use this per-day schedule instead of the defaults above</label>
          {Array.from({length:planLength},(_,i)=><fieldset key={i}><legend>Day {i+1}</legend>
            <label><input type="checkbox" name={`home-${i}`} defaultChecked /> Home-cooked dinner</label>
            <div className="check-row">{data.users.map(u=><label key={u.id}><input type="checkbox" name={`people-${i}`} value={u.id} defaultChecked />{u.name}</label>)}</div>
            <label>Servings<input type="number" name={`servings-${i}`} min="0.5" step="0.5" defaultValue="3" required /></label>
          </fieldset>)}
        </details>
        <label className="checkbox-label">
          <input name="leftovers" type="checkbox" defaultChecked />
          Plan intentional leftovers from a larger batch
        </label>
        <p className="notice">
          YES votes lead the choices, with variety and recent menus considered.
          Seafood stays off James’s plate. Taco night follows your Settings.
          Every cooked dinner includes vegetables.
        </p>
        <button className="primary full" disabled={busy}>
          <Sparkles size={17} /> Generate my menu
        </button>
      </form>
    </Modal>
  );
}
function EditDay({
  day,
  menu,
  onClose,
}: {
  day: Day;
  menu: Menu;
  onClose: () => void;
}) {
  const { data, act, busy } = useApp();
  const [kind, setKind] = useState(day.kind),
    [recipe, setRecipe] = useState(day.recipe_id || "sticky-chicken"),
    [people, setPeople] = useState<string[]>(JSON.parse(day.attendees));
  const [variationId, setVariationId] = useState(day.variation_id || "");
  const selectedRecipe = data.recipes.find((r) => r.id === recipe);
  const sources = menu.days.filter(
    (d) =>
      d.kind === "cook" &&
      d.date < day.date &&
      d.date >=
        new Date(new Date(day.date + "T12:00:00Z").getTime() - 3 * 86400000)
          .toISOString()
          .slice(0, 10),
  );
  return (
    <Modal title={`Dinner · ${dayLabel(day.date)}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await act(
              `/menu-days/${day.id}`,
              "PATCH",
              {
                kind,
                recipeId: kind === "out" ? null : recipe,
                variationId: kind === "cook" ? variationId || null : null,
                portions: Number(f.get("portions")),
                attendees: people,
                leftoverRecipeId: kind==="leftover" ? f.get("leftoverRecipeId") || null : null,
                leftoverOf:
                  kind === "leftover" ? Number(f.get("leftoverOf")) : null,
              },
              "Dinner updated. Approve the menu to refresh shopping.",
            );
            onClose();
          } catch {}
        }}
      >
        <label>
          Tonight’s plan
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Day["kind"])}
          >
            <option value="cook">Cook a dinner</option>
            <option value="leftover">Use leftovers from this menu</option>
            <option value="out">Dinner out / no cooking</option>
          </select>
        </label>
        {kind === "leftover" && <label>Serve reserved batch as<select name="leftoverRecipeId" defaultValue={day.leftover_recipe_id||''}><option value="">Original dinner</option><option value="brisket-tacos">Brisket tacos (brisket source only)</option><option value="brisket-bowls">Brisket rice bowls (brisket source only)</option></select></label>}
        {kind === "cook" && (
          <label>
            Recipe
            <select
              aria-label="Recipe"
              value={recipe}
              onChange={(e) => {
                setRecipe(e.target.value);
                setVariationId("");
              }}
            >
              {data.recipes
                .filter(
                  (r) =>
                    r.category === "Dinner" &&
                    !r.archived &&
                    !(
                      people.includes("james") &&
                      ["Fish", "Shrimp"].includes(r.protein)
                    ),
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        {kind === "cook" && selectedRecipe?.variations?.length && (
          <label>
            Recipe option
            <select
              aria-label="Recipe option"
              value={variationId || selectedRecipe.variations[0].id}
              onChange={(e) => setVariationId(e.target.value)}
            >
              {selectedRecipe.variations.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <small>
              The shopping list uses only the ingredients for this option.
            </small>
          </label>
        )}
        {kind === "leftover" && (
          <label>
            Cooked batch
            <select
              name="leftoverOf"
              required
              defaultValue={day.leftover_of || sources.at(-1)?.id || ""}
            >
              <option value="" disabled>
                Choose a prior dinner
              </option>
              {sources.map((d) => (
                <option key={d.id} value={d.id}>
                  {dayLabel(d.date)} ·{" "}
                  {data.recipes.find((r) => r.id === d.recipe_id)?.title}
                </option>
              ))}
            </select>
            <small>
              The source dinner’s batch grows to include these portions. Rice
              leftovers must be next day; all others within 3 days.
            </small>
          </label>
        )}
        <label>
          Generous portions
          <input
            name="portions"
            type="number"
            required
            min="0.5"
            max="1000"
            step="0.5"
            defaultValue={day.portions}
          />
        </label>
        <fieldset>
          <legend>Who’s at the table?</legend>
          <div className="check-row">
            {data.users.map((u) => (
              <label key={u.id}>
                <input
                  type="checkbox"
                  checked={people.includes(u.id)}
                  onChange={(e) =>
                    setPeople((p) =>
                      e.target.checked
                        ? [...p, u.id]
                        : p.filter((id) => id !== u.id),
                    )
                  }
                />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary full" disabled={busy || !people.length}>
          Save dinner <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
function MenuPage() {
  const { data, act, busy, admin, openRecipe } = useApp();
  const [selected, setSelected] = useState(data.menus[0]?.id || 0),
    [generate, setGenerate] = useState(false),
    [editing, setEditing] = useState<Day | null>(null),
    [task, setTask] = useState(false);
  const menu = data.menus.find((m) => m.id === selected) || data.menus[0];
  return (
    <>
      <PageHeading
        eyebrow="LESS “WHAT’S FOR DINNER?”"
        title="A week worth gathering for."
        description="A balanced plan, a little flexibility, and something green on every plate."
      >
        {admin && (
          <button className="primary" onClick={() => setGenerate(true)}>
            <Sparkles size={17} /> Plan a new week
          </button>
        )}
      </PageHeading>
      {!menu ? (
        <Empty
          icon={CalendarDays}
          title={
            admin
              ? "Set the table for your week."
              : "The next menu is in the kitchen."
          }
          action={
            admin ? (
              <button className="primary" onClick={() => setGenerate(true)}>
                Generate a 7- or 14-day menu
              </button>
            ) : undefined
          }
        >
          {admin
            ? "Turn your family’s votes into a dinner plan you can adjust and approve."
            : "Shani’s approved menus will appear here, with all the dinner details."}
        </Empty>
      ) : (
        <>
          <div className="menu-toolbar panel">
            <div>
              <label>
                YOUR FAMILY MENU
                <select
                  aria-label="Select menu"
                  value={menu.id}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {data.menus.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.title} · {m.start_date}
                    </option>
                  ))}
                </select>
              </label>
              <Badge tone={menu.status === "approved" ? "green" : "peach"}>
                {menu.status === "approved"
                  ? "Approved for the table"
                  : "Draft · Shani’s review"}
              </Badge>
            </div>
            <div className="button-row">
              {admin && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/menus/${menu.id}/regenerate`,
                        "POST",
                        {},
                        "Unlocked dinners regenerated",
                      ).catch(() => {})
                    }
                  >
                    <RefreshCw size={15} /> Refresh unlocked
                  </button>
                  <button className="secondary" onClick={() => setTask(true)}>
                    <Plus size={15} /> Add baking / lunch
                  </button>
                  {menu.status !== "approved" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/menus/${menu.id}/approve`,
                          "POST",
                          {},
                          "Menu approved. Your shopping list is ready.",
                        ).catch(() => {})
                      }
                    >
                      <Check size={16} />
                      Approve menu
                    </button>
                  )}
                </>
              )}
              <button className="secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print menu
              </button>
            </div>
          </div>
          <div className="menu-notice">
            <Leaf size={18} />
            <p>
              {menu.status === "approved"
                ? "Your menu is approved. Shopping includes every vegetable side and reserved leftover portion."
                : "Review each dinner, attendance and portions, then approve to calculate the shopping list."}{" "}
              Lock dinners you want to keep when refreshing.
            </p>
          </div>
          <div className="print-title">
            <h1>{menu.title}</h1>
            <p>{dayLabel(menu.start_date)} · Family fridge menu</p>
          </div>
          <div className="menu-days">
            {menu.days.map((d, i) => {
              const r = resolveRecipeView(
                  data.recipes.find((r) => r.id === (d.leftover_recipe_id || d.recipe_id)),
                  d.variation_id,
                ),
                source = menu.days.find((x) => x.id === d.leftover_of),
                reserved = menu.days
                  .filter((x) => x.leftover_of === d.id)
                  .reduce((s, x) => s + x.portions, 0);
              return (
                <article
                  className={`menu-day ${d.kind === "out" ? "night-out" : ""}`}
                  key={d.id}
                >
                  <div className="day-date">
                    <strong>{dayLabel(d.date, { weekday: "short" })}</strong>
                    <span>
                      {dayLabel(d.date, { month: "short", day: "numeric" })}
                    </span>
                    {!!d.locked && <Lock size={13} />}
                  </div>
                  <div className="day-photo">
                    {r ? <Food recipe={r} /> : <Utensils size={26} />}
                  </div>
                  <div className="day-content">
                    <div className="day-title">
                      <button
                        className="text-title"
                        onClick={() => r && openRecipe(r)}
                      >
                        {d.kind === "out" ? "Taco night out" : r?.title}
                      </button>
                      {(r?.variationLabel || r?.variations?.[0]?.label) && (
                        <Badge tone="cream">
                          {r?.variationLabel || r?.variations?.[0]?.label}
                        </Badge>
                      )}
                      {d.kind === "leftover" && (
                        <Badge tone="green">Planned leftovers</Badge>
                      )}
                    </div>
                    <p>
                      {d.kind === "out"
                        ? "A night off for the kitchen. No groceries needed."
                        : r?.cut}
                    </p>
                    {r && (
                      <span className="day-vegetables">
                        <Leaf size={13} />
                        {r.vegetables}
                      </span>
                    )}
                    <small className="day-prep">
                      {d.kind === "leftover"
                        ? `Reheat reserved portions from ${source ? dayLabel(source.date) : "the prior dinner"} to 165°F.`
                        : d.kind === "cook"
                          ? `${r?.prep} min prep · ${r?.cook} min cooking${reserved ? ` · Make ${d.portions + reserved} portions; reserve ${reserved} for leftovers.` : ""}`
                          : ""}
                    </small>
                    <details className="explanation">
                      <summary>Why this dinner?</summary>
                      <p>{d.reason}</p>
                    </details>
                  </div>
                  {admin && d.recipe_id && <button disabled={busy || !!data.cookedMeals?.some(h=>h.menu_day_id===d.id)} onClick={()=>act(`/menu-days/${d.id}/cooked`,"POST",{}).catch(()=>{})}>{data.cookedMeals?.some(h=>h.menu_day_id===d.id)?"Cooked ✓":"Mark as Cooked"}</button>}
                  <div className="day-people">
                    <div className="avatar-stack">
                      {(JSON.parse(d.attendees) as string[]).map((id) => (
                        <Person id={id} small key={id} />
                      ))}
                    </div>
                    <small>{d.portions} portions</small>
                  </div>
                  {admin && (
                    <div className="day-actions">
                      <button
                        className="icon-button"
                        aria-label={`${d.locked ? "Unlock" : "Lock"} ${d.date}`}
                        disabled={busy}
                        onClick={() =>
                          act(`/menu-days/${d.id}`, "PATCH", {
                            locked: !d.locked,
                          }).catch(() => {})
                        }
                      >
                        {d.locked ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${d.date}`}
                        disabled={!!d.locked}
                        onClick={() => setEditing(d)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move ${d.date} up`}
                        disabled={i === 0 || !!d.locked || busy}
                        onClick={() =>
                          act(`/menus/${menu.id}/swap`, "POST", {
                            a: d.id,
                            b: menu.days[i - 1]?.id,
                          }).catch(() => {})
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move ${d.date} down`}
                        disabled={
                          i === menu.days.length - 1 || !!d.locked || busy
                        }
                        onClick={() =>
                          act(`/menus/${menu.id}/swap`, "POST", {
                            a: d.id,
                            b: menu.days[i + 1]?.id,
                          }).catch(() => {})
                        }
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {menu.tasks.length > 0 && (
            <section className="extras">
              <h2>And a little something extra</h2>
              {menu.tasks.map((t) => {
                const r = data.recipes.find((r) => r.id === t.recipe_id);
                return (
                  <div className="panel extra-row" key={t.id}>
                    <ChefHat size={22} />
                    <div>
                      <button
                        className="text-title"
                        onClick={() => r && openRecipe(r)}
                      >
                        {r?.title}
                      </button>
                      <small>
                        {dayLabel(t.date)} · {t.portions}{" "}
                        {r?.category === "Baking" ? "cookies" : "portions"} ·
                        Ingredients included after approval
                      </small>
                    </div>
                    {admin && (
                      <button
                        className="icon-button"
                        aria-label={`Remove ${r?.title}`}
                        onClick={() =>
                          act(
                            `/tasks/${t.id}`,
                            "DELETE",
                            {},
                            "Extra removed; reapprove the menu",
                          ).catch(() => {})
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          <div className="notice menu-food-note">
            Keep cooked leftovers refrigerated at 40°F or below. Refrigerate
            within 2 hours, cool rice within 1 hour, reheat to 165°F. The plan
            limits leftover timing; always follow the recipe’s storage guidance.
          </div>
        </>
      )}
      {generate && (
        <GenerateMenu
          onClose={() => setGenerate(false)}
          onCreated={setSelected}
        />
      )}{" "}
      {editing && menu && (
        <EditDay day={editing} menu={menu} onClose={() => setEditing(null)} />
      )}{" "}
      {task && menu && (
        <ScheduleTask menu={menu} onClose={() => setTask(false)} />
      )}
    </>
  );
}
function ShoppingPage() {
  const { data, act, busy, admin, go, notify } = useApp();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const approved = data.menus.filter((m) => m.status === "approved");
  const [selected, setSelected] = useState(approved[0]?.id || 0),
    [add, setAdd] = useState(false),
    [pantry, setPantry] = useState(false),
    [edit, setEdit] = useState<ShoppingItem | null>(null),
    [hideChecked, setHideChecked] = useState(false);
  const menu = approved.find((m) => m.id === selected) || approved[0];
  const items = menu ? data.shoppingLists[menu.id] || [] : [];
  const checked = items.filter((x) => x.checked || x.have).length;
  const update = (item: ShoppingItem, changes: Record<string, unknown>) => {
    const key = `${menu.id}:${item.key}`;
    if (typeof changes.checked === "boolean")
      setChecks((old) => ({ ...old, [key]: changes.checked as boolean }));
    return act(`/shopping/${menu.id}/state`, "PUT", {
      key: item.key,
      ...changes,
    })
      .catch(() => {})
      .finally(() =>
        setChecks((old) => {
          const next = { ...old };
          delete next[key];
          return next;
        }),
      );
  };
  return (
    <>
      <PageHeading
        eyebrow="ONE STORE. ONE SHARED LIST."
        title="The good stuff to bring home."
        description="Every dinner, every side, every approved extra. Organized for Trader Joe’s."
      >
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={16} /> Print list
        </button>
        {admin && (
          <button className="primary" onClick={() => setAdd(true)}>
            <Plus size={16} /> Add an item
          </button>
        )}
      </PageHeading>
      {!menu ? (
        <Empty
          icon={ShoppingBasket}
          title="A good list starts with an approved plan."
          action={
            admin ? (
              <button className="primary" onClick={() => go("/menu")}>
                Review the menu
              </button>
            ) : undefined
          }
        >
          Shopping quantities are finalized only after Shani approves the menu.
          Drafts won’t create a misleading list.
        </Empty>
      ) : (
        <>
          <div className="shopping-summary panel">
            <label>
              SHOPPING FOR
              <select
                aria-label="Shopping menu"
                value={menu.id}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {approved.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="shopping-progress">
              <strong>
                {checked}
                <span> / {items.length} taken care of</span>
              </strong>
              <div className="progress-track">
                <span
                  style={{
                    width: `${(checked / Math.max(items.length, 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="button-row">
              {admin && (
                <button
                  className="secondary"
                  onClick={() => setPantry(!pantry)}
                >
                  <ClipboardList size={15} />
                  {pantry ? "Close pantry" : "Check the pantry"}
                </button>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={hideChecked}
                  onChange={(e) => setHideChecked(e.target.checked)}
                />
                Hide checked
              </label>
            </div>
          </div>
          {pantry && (
            <section className="panel pantry-panel">
              <div className="section-title">
                <div>
                  <h2>Already in the kitchen?</h2>
                  <p>
                    These staples are suggestions, not assumed inventory. Check
                    only what you have in sufficient quantity.
                  </p>
                </div>
              </div>
              <div className="pantry-grid">
                {data.pantry.map((p) => (
                  <label className="checkbox-label" key={p.ingredient_id}>
                    <input
                      type="checkbox"
                      checked={!!p.have}
                      disabled={busy}
                      onChange={(e) =>
                        act(
                          `/pantry/${p.ingredient_id}`,
                          "PUT",
                          { have: e.target.checked },
                          "Pantry updated",
                        ).catch(() => {})
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </section>
          )}
          <div className="notice">
            <ShoppingBasket size={18} />
            <span>
              Recipe consumption is listed below. Adjust the purchase quantity
              for store packaging; recipe amounts stay intact. Different cuts,
              can sizes and incompatible units stay separate. Optional
              ingredients are labeled.
            </span>
          </div>
          <div className="print-title">
            <h1>Trader Joe’s shopping list</h1>
            <p>{menu.title}</p>
          </div>
          <div className="shopping-groups">
            {storeSections.map((section) => {
              const group = items.filter(
                (x) =>
                  x.section === section &&
                  (!hideChecked || (!x.checked && !x.have)),
              );
              if (!group.length) return null;
              return (
                <section className="shopping-section" key={section}>
                  <h2>
                    <span>{section}</span>
                    <small>{group.length} items</small>
                  </h2>
                  {group.map((item) => (
                    <div
                      className={`shopping-row ${item.checked ? "checked" : ""} ${item.have ? "have" : ""}`}
                      key={item.key}
                    >
                      <label className="shop-check">
                        <input
                          type="checkbox"
                          checked={
                            checks[`${menu.id}:${item.key}`] ?? item.checked
                          }
                          disabled={busy}
                          aria-label={`Purchased ${item.name}`}
                          onChange={(e) =>
                            update(item, { checked: e.target.checked })
                          }
                        />
                        <span>
                          <strong>
                            {item.name}
                            {item.optional && <Badge>Optional</Badge>}
                          </strong>
                          <small>{item.sources.join(" · ")}</small>
                        </span>
                      </label>
                      <div className="shopping-amount">
                        {item.packageCount!=null && <small>{item.packageCount} confirmed-size packages</small>}
                        <strong>
                          {amount(
                            item.purchaseQuantity ?? item.quantity,
                            item.unit,
                          )}
                        </strong>
                        <small>
                          {item.purchaseQuantity !== null
                            ? `Recipe need: ${amount(item.quantity, item.unit)}`
                            : item.key.startsWith("manual:")
                              ? "Approved addition"
                              : "Recipe consumption"}
                        </small>
                      </div>
                      {admin && item.ingredientId && <details><summary>Inventory & package size</summary>
                        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act(`/pantry-inventory/${item.ingredientId}`,'PUT',{quantity:Number(f.get('quantity')),unit:item.unit}).catch(()=>{});}}>
                          <label>Confirmed pantry ({item.unit})<input name="quantity" type="number" min="0" step="any" required /></label><button>Save pantry quantity</button>
                        </form>
                        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act(`/purchase-rules/${item.ingredientId}`,'PUT',{packageSize:Number(f.get('size')),unit:item.unit}).catch(()=>{});}}>
                          <label>Verified package size ({item.unit})<input name="size" type="number" min="0.001" step="any" required /></label><button>Confirm package size</button>
                        </form>
                      </details>}
                      {admin && (
                        <div className="shopping-actions">
                          <button
                            className={`small-button ${item.have ? "green" : ""}`}
                            disabled={busy}
                            onClick={() => {
                              if (item.pantry && item.have) {
                                act(`/pantry/${item.ingredientId}`, "PUT", {
                                  have: false,
                                })
                                  .then(() => update(item, { have: false }))
                                  .catch(() => {});
                              } else update(item, { have: !item.have });
                            }}
                          >
                            {item.have ? <Check size={13} /> : null}
                            {item.have ? "Already have" : "Have it?"}
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Edit purchase quantity for ${item.name}`}
                            onClick={() => setEdit(item)}
                          >
                            <Pencil size={15} />
                          </button>
                          {item.key.startsWith("manual:") && (
                            <button
                              className="icon-button"
                              aria-label={`Remove ${item.name}`}
                              onClick={() =>
                                act(
                                  `/shopping/manual/${item.key.split(":")[1]}`,
                                  "DELETE",
                                  {},
                                  "Item removed",
                                ).catch(() => {})
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
          {items.length === 0 && (
            <Empty icon={ShoppingBasket} title="Nothing to buy for this plan">
              Add a cooking day or a grocery request.
            </Empty>
          )}
        </>
      )}
      {add && <AddShopping menuId={menu?.id} onClose={() => setAdd(false)} />}{" "}
      {edit && (
        <Modal title="Adjust what you’ll buy" onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await act(
                  `/shopping/${menu.id}/state`,
                  "PUT",
                  {
                    key: edit.key,
                    purchaseQuantity: Number(f.get("quantity")),
                  },
                  "Purchase quantity saved",
                );
                setEdit(null);
              } catch {}
            }}
          >
            <h3>{edit.name}</h3>
            <p className="muted">
              Recipe consumption: {amount(edit.quantity, edit.unit)}. Enter the
              amount you’ll buy in {edit.unit}. For packages and cans, the
              product size is part of the ingredient name.
            </p>
            <label>
              Purchase quantity ({edit.unit})
              <input
                name="quantity"
                type="number"
                required
                step="0.001"
                min="0"
                max="100000"
                defaultValue={edit.purchaseQuantity ?? edit.quantity}
              />
            </label>
            <button className="primary full" disabled={busy}>
              Save purchase quantity
            </button>
            <button
              className="text-link centered"
              type="button"
              onClick={async () => {
                try {
                  await act(`/shopping/${menu.id}/state`, "PUT", {
                    key: edit.key,
                    purchaseQuantity: null,
                  });
                  setEdit(null);
                } catch {}
              }}
            >
              Reset to recipe consumption
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function SettingsPage() {
  const { data, act, busy, admin, notify } = useApp();
  const [history, setHistory] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="MAKE THIS KITCHEN YOURS"
        title="Your family, your rhythm."
        description="A few thoughtful defaults. Plenty of room to make it yours."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="eyebrow">AT THE TABLE</div>
          <h2>The family</h2>
          {data.users.map((u) => (
            <div className="settings-person" key={u.id}>
              <Person id={u.id} />
              <div>
                <strong>{u.name}</strong>
                <small>
                  {u.role === "admin"
                    ? "Mom · recipes, menus & approvals"
                    : u.id === "james"
                      ? "Votes & requests · no seafood or asparagus"
                      : "Votes, requests & family plans"}
                </small>
              </div>
              {u.id === data.user.id && <Badge tone="green">You</Badge>}
            </div>
          ))}
          <button
            className="secondary full"
            onClick={async () => {
              try {
                const url = location.origin;
                if (navigator.share)
                  await navigator.share({
                    title: "Dinner Democracy",
                    text: "Come vote for dinner!",
                    url,
                  });
                else {
                  await navigator.clipboard.writeText(url);
                  notify("Family link copied. Share passwords privately.");
                }
              } catch {
                notify(
                  "Share the app’s address from your browser. Send passwords separately.",
                );
              }
            }}
          >
            <Share2 size={16} />
            Share the family link
          </button>
          <p className="small muted">
            Family members open the same hosted address on their phones and sign
            in with their own profile password.
          </p>
        </section>
        <section className="panel settings-panel">
          <div className="eyebrow">OUR HOUSE RULES</div>
          <h2>A little dinner rhythm</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await act(
                  "/settings",
                  "PATCH",
                  { tacoDay: Number(f.get("tacoDay")) },
                  "Dinner rhythm saved for future menus",
                );
              } catch {}
            }}
          >
            <label>
              Taco night out
              <select
                name="tacoDay"
                disabled={!admin}
                defaultValue={data.settings.tacoDay}
              >
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
                <option value="-1">No regular night out</option>
              </select>
            </label>
            <p className="muted small">
              Applies when generating or refreshing a menu. Existing approved
              menus stay as planned.
            </p>
            {admin && <label>Seasonal share for new rounds (%)<input type="number" min="0" max="100" defaultValue={Math.round((data.settings.seasonalWeight??.6)*100)} onBlur={e=>{const weight=Number(e.target.value)/100;if(weight>=0&&weight<=1)act('/seasonal-weight','PUT',{weight}).catch(()=>{});}} /></label>}
            <div className="rules-list">
              <span>
                <CheckCircle2 size={16} /> Gluten-free by default
              </span>
              <span>
                <CheckCircle2 size={16} /> A vegetable at every dinner
              </span>
              <span>
                <CheckCircle2 size={16} /> No bell peppers, sausage or
                sandwiches
              </span>
              <span>
                <CheckCircle2 size={16} /> Minimize dairy and eggs
              </span>
              <span>
                <CheckCircle2 size={16} /> Seafood only when James isn’t
                attending
              </span>
            </div>
            {admin && (
              <button className="primary" disabled={busy}>
                Save our rhythm
              </button>
            )}
          </form>
        </section>
        <section className="panel settings-panel">
          <div className="eyebrow">KEEP YOUR PROFILE YOURS</div>
          <h2>
            {admin ? "Passwords & family access" : "Change your password"}
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              try {
                await act(
                  "/password",
                  "POST",
                  {
                    currentPassword: f.get("currentPassword"),
                    newPassword: f.get("newPassword"),
                    userId: f.get("userId") || data.user.id,
                  },
                  "Password updated; previous sessions for that profile have been signed out.",
                );
                form.reset();
              } catch {}
            }}
          >
            {admin && (
              <label>
                Update profile
                <select name="userId" defaultValue={data.user.id}>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Your current {admin ? "admin " : ""}password
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button className="secondary" disabled={busy}>
              Update password
            </button>
          </form>
        </section>
        <section className="panel settings-panel">
          <div className="eyebrow">A RECIPE BOX WITH MEMORY</div>
          <h2>What we know, and what we don’t.</h2>
          <p className="muted">
            Your supplied inventory is the source of truth. Crispy Salmon Rice
            Bowls and Harissa Shaved Lamb are confirmed favorites. Fall dishes
            are never-tried candidates. Other past cooking details are
            unconfirmed.
          </p>
          <p className="muted">
            Exact prior conversations weren’t available. Reconstructed
            quantities and methods are marked for review. Images are
            illustrative.
          </p>
          <button className="text-link" onClick={() => setHistory(!history)}>
            {history ? "Hide" : "Show"} saved history counts{" "}
            <ChevronRight size={15} />
          </button>
          {history && (
            <p className="notice">
              {data.rounds.length} voting rounds · {data.menus.length} visible
              menus · {data.requests.length} family requests. New rounds
              preserve earlier votes. Approved plans are shared with everyone.
            </p>
          )}
          <button
            className="secondary full signout"
            onClick={() =>
              act("/logout", "POST", {})
                .then(() => location.assign("/"))
                .catch(() => {})
            }
          >
            <LogOut size={16} />
            Sign out of this profile
          </button>
        </section>
      </div>
    </>
  );
}
function RecipeDetail({
  recipe: baseRecipe,
  initialVariationId,
  onClose,
}: {
  recipe: Recipe;
  initialVariationId?: string;
  onClose: () => void;
}) {
  const { admin, data, act, busy, notify } = useApp();
  const [variationId, setVariationId] = useState(initialVariationId || "");
  const r = resolveRecipeView(baseRecipe, variationId)!;
  const [servings, setServings] = useState(r.servings),
    [cooking, setCooking] = useState(false),
    [checked, setChecked] = useState<number[]>([]),
    [edit, setEdit] = useState(false),
    [awake, setAwake] = useState(false),
    [history, setHistory] = useState<
      { version: number; created_at: string; edited_by: string }[] | null
    >(null);
  const wake = useRef<any>(null);
  const [ingredients, setIngredients] = useState(r.ingredients);
  useEffect(
    () => () => {
      wake.current?.release();
    },
    [],
  );
  async function keepAwake() {
    try {
      if (awake) {
        await wake.current?.release();
        setAwake(false);
      } else {
        if (!("wakeLock" in navigator))
          throw Error("Screen wake lock is not supported in this browser.");
        wake.current = await (navigator as any).wakeLock.request("screen");
        setAwake(true);
        wake.current.addEventListener("release", () => setAwake(false));
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await act(
        `/recipes/${r.id}`,
        "PATCH",
        {
          title: f.get("title"),
          protein: f.get("protein"),
          cut: f.get("cut"),
          vegetables: f.get("vegetables"),
          prep: Number(f.get("prep")),
          cook: Number(f.get("cook")),
          description: f.get("description"),
          notes: f.get("notes"),
          steps: String(f.get("steps"))
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          ingredients: ingredients.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            unit: i.unit,
            note: i.note || "",
            form: i.form || "as_purchased",
            substitutions: i.substitutions || [],
          })),
          madeBefore:
            f.get("madeBefore") === "unknown"
              ? null
              : f.get("madeBefore") === "yes",
          favorite: f.get("favorite") === "on",
          servings: Number(f.get("baseServings")),
        },
        "Recipe version saved. Related menus need review and approval.",
      );
      setEdit(false);
    } catch {}
  }
  return (
    <Modal
      title={cooking ? "At the stove" : edit ? "Make it your own" : r.title}
      onClose={onClose}
      wide
    >
      <div className={`recipe-detail ${cooking ? "cooking" : ""}`}>
        {edit ? (
          <form onSubmit={save}>
            <p className="notice">
              Changing a recipe saves the prior version and returns any related
              menus to draft for grocery review.
            </p>
            <label>
              Recipe name
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={r.title}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={1500}
                defaultValue={r.description}
              />
            </label>
            <div className="form-row">
              <label>
                Protein type
                <select name="protein" defaultValue={r.protein}>
                  {[
                    "Chicken",
                    "Beef",
                    "Pork",
                    "Lamb",
                    "Fish",
                    "Shrimp",
                    "Turkey & beef",
                    "Vegetarian",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Exact cut
                <input
                  name="cut"
                  required
                  minLength={5}
                  maxLength={250}
                  defaultValue={r.cut}
                />
              </label>
            </div>
            <label>
              Vegetables / explicit side
              <input
                name="vegetables"
                required
                minLength={3}
                maxLength={250}
                defaultValue={r.vegetables}
              />
            </label>
            <div className="form-row">
              <label>
                Prep minutes
                <input
                  name="prep"
                  type="number"
                  required
                  min="0"
                  max="1440"
                  defaultValue={r.prep}
                />
              </label>
              <label>
                Cooking minutes
                <input
                  name="cook"
                  type="number"
                  required
                  min="0"
                  max="1440"
                  defaultValue={r.cook}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Base generous servings
                <input
                  name="baseServings"
                  required
                  type="number"
                  min="0.5"
                  max="1000"
                  step="0.5"
                  defaultValue={r.servings}
                />
              </label>
              <label>
                Previously made?
                <select
                  name="madeBefore"
                  defaultValue={
                    r.madeBefore === null
                      ? "unknown"
                      : r.madeBefore
                        ? "yes"
                        : "no"
                  }
                >
                  <option value="unknown">Unconfirmed</option>
                  <option value="yes">Yes, we’ve made it</option>
                  <option value="no">No, never tried</option>
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                name="favorite"
                type="checkbox"
                defaultChecked={r.favorite}
              />
              Confirmed family favorite
            </label>
            <h3>Ingredient quantities</h3>
            <IngredientBuilder
              ingredients={ingredients}
              setIngredients={setIngredients}
            />
            <label>
              Steps (one per line)
              <textarea
                name="steps"
                required
                rows={8}
                defaultValue={r.steps.join("\n")}
              />
            </label>
            <label>
              Personal notes & substitutions
              <textarea
                name="notes"
                rows={4}
                maxLength={5000}
                defaultValue={r.notes}
              />
            </label>
            <div className="button-row">
              <button className="primary" disabled={busy}>
                Save a new recipe version
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEdit(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {!cooking && (
              <>
                <div className="detail-photo">
                  <Food recipe={r} />
                  <Badge tone="cream">
                    {r.cuisine} · {r.category}
                  </Badge>
                </div>
                <div className="detail-title">
                  <div>
                    <div className="eyebrow">
                      {r.favorite
                        ? "★ CONFIRMED FAMILY FAVORITE"
                        : r.madeBefore === false
                          ? "NEW / NEVER TRIED"
                          : "COOKING HISTORY UNCONFIRMED"}
                    </div>
                    <h1>{r.title}</h1>
                    <p>{r.description}</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Save recipe as favorite"
                    onClick={() =>
                      act(`/favorites/${r.id}`, "PUT", {
                        favorite: !data.favorites.includes(r.id),
                      }).catch(() => {})
                    }
                  >
                    <Heart
                      fill={
                        data.favorites.includes(r.id) ? "currentColor" : "none"
                      }
                    />
                  </button>
                </div>
                <div className="detail-facts">
                  <span>
                    <Clock size={17} />
                    {r.prep} min prep · {r.cook} min cooking
                  </span>
                  <span>
                    <Leaf size={17} />
                    {r.glutenFree ? "Gluten-free" : "Diet review needed"}
                  </span>
                  <span>{r.dairy ? "Contains dairy" : "Dairy-free"}</span>
                  <span>{r.egg ? "Contains egg" : "Egg-free"}</span>
                </div>
                <div className="source-note">
                  <strong>
                    {r.source} · v{r.version}
                  </strong>
                  <p>{r.sourceNote}</p>
                </div>
              </>
            )}
            {r.variations?.length && (
              <div className="recipe-options-panel">
                <label>
                  Recipe option
                  <select
                    aria-label="Recipe option"
                    value={variationId || r.variations[0].id}
                    onChange={(e) => {
                      setVariationId(e.target.value);
                      setChecked([]);
                    }}
                  >
                    {r.variations.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Preview the ingredients and method here. Choose the same
                  option on your weekly menu to use it for shopping.
                </p>
              </div>
            )}
            {!!r.catalogConflicts?.length && (
              <div className="notice">
                <div>
                  <strong>Your personal edits were kept.</strong>
                  <p>
                    The reviewed library update also changed:{" "}
                    {r.catalogConflicts.join(", ")}. You can edit these yourself
                    or apply the reviewed fields below; your previous version
                    stays in history.
                  </p>
                  {admin && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/recipes/${r.id}/catalog-review`,
                          "POST",
                          {},
                          "Reviewed fields applied; check and approve affected menus",
                        ).catch(() => {})
                      }
                    >
                      Use reviewed changes
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="detail-controls">
              <div className="servings-control">
                <span>
                  {r.category === "Baking" ? "Cookies" : "Generous servings"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Fewer servings"
                  disabled={servings <= 1}
                  onClick={() => setServings((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <strong>{servings}</strong>
                <button
                  className="icon-button"
                  aria-label="More servings"
                  disabled={servings >= 100}
                  onClick={() => setServings((n) => n + 1)}
                >
                  +
                </button>
              </div>
              <div className="button-row">
                <button
                  className={cooking ? "primary" : "secondary"}
                  onClick={() => setCooking(!cooking)}
                >
                  <ChefHat size={17} />
                  {cooking ? "Exit cooking mode" : "Start cooking"}
                </button>
                {cooking && (
                  <button className="secondary" onClick={keepAwake}>
                    <Sun size={16} />
                    {awake ? "Screen staying awake" : "Keep screen awake"}
                  </button>
                )}
                {admin && !r.archived && !cooking && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setVariationId("");
                      setIngredients(baseRecipe.ingredients);
                      setEdit(true);
                    }}
                  >
                    <Pencil size={15} />
                    Edit recipe
                  </button>
                )}
              </div>
            </div>
            {r.archived ? (
              <p className="notice">
                Archived idea only; excluded from all dinner planning and
                shopping calculations.
              </p>
            ) : (
              <div className="recipe-columns">
                <section>
                  <h2>What you’ll need</h2>
                  <p className="small muted">Protein: {r.cut}</p>
                  <ul className="ingredients">
                    {r.ingredients.map((i, n) => (
                      <li key={`${i.id}-${n}`}>
                        <strong>
                          {formatQty((i.quantity * servings) / r.servings)}{" "}
                          {i.unit}
                        </strong>
                        <span>
                          {i.name}
                          {i.note && <small>{i.note}</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="vegetable-callout">
                    <Leaf size={18} />
                    <span>
                      <strong>Vegetables included</strong>
                      {r.vegetables}
                    </span>
                  </p>
                </section>
                <section>
                  <h2>Let’s make it</h2>
                  <div className="cooking-steps">
                    {r.steps.map((step, i) => (
                      <label
                        className={checked.includes(i) ? "done" : ""}
                        key={i}
                      >
                        <input
                          type="checkbox"
                          checked={checked.includes(i)}
                          onChange={(e) =>
                            setChecked((c) =>
                              e.target.checked
                                ? [...c, i]
                                : c.filter((n) => n !== i),
                            )
                          }
                        />
                        <span className="step-number">
                          {checked.includes(i) ? <Check size={15} /> : i + 1}
                        </span>
                        <p>{step}</p>
                      </label>
                    ))}
                  </div>
                  <div className="recipe-notes">
                    <h3>Notes & substitutions</h3>
                    <p>{r.notes}</p>
                    <h3>Tomorrow’s delicious idea</h3>
                    <p>{r.leftover}</p>
                  </div>
                </section>
              </div>
            )}
            {admin && !cooking && (
              <div className="version-history">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await act(
                        `/recipes/${r.id}/archive`,
                        "PATCH",
                        { archived: !r.archived },
                        r.archived
                          ? "Recipe restored for future rounds"
                          : "Recipe archived; review affected menus",
                      );
                      onClose();
                    } catch {}
                  }}
                >
                  {r.archived
                    ? "Restore recipe to library"
                    : "Archive from active rotation"}
                </button>
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      if (history) setHistory(null);
                      else setHistory(await api(`/recipes/${r.id}/history`));
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Recipe editing history <ChevronRight size={15} />
                </button>
                {history &&
                  (history.length ? (
                    <ul>
                      {history.map((v) => (
                        <li key={v.version}>
                          Version {v.version} saved before edit by{" "}
                          {v.edited_by || "Recipe library update"} ·{" "}
                          {v.created_at}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small muted">
                      No edits yet. The original seeded reconstruction is
                      version 1.
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
function IngredientBuilder({
  ingredients,
  setIngredients,
}: {
  ingredients: Recipe["ingredients"];
  setIngredients: React.Dispatch<React.SetStateAction<Recipe["ingredients"]>>;
}) {
  const { data } = useApp();
  const [ingredient, setIngredient] = useState("broccoli");
  return (
    <div>
      <label>
        Add ingredient from the shared catalog
        <select
          value={ingredient}
          onChange={(e) => setIngredient(e.target.value)}
        >
          {data.ingredientCatalog
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const item = data.ingredientCatalog.find((i) => i.id === ingredient)!;
          setIngredients((old) => [
            ...old,
            {
              ...item,
              quantity: 1,
              unit: ["broccoli", "thigh", "flank", "breast"].includes(item.id)
                ? "lb"
                : "each",
              note: "",
            },
          ]);
        }}
      >
        <Plus size={14} /> Add ingredient
      </button>
      <div className="ingredient-edit">
        {ingredients.map((i, index) => (
          <div className="ingredient-builder-row" key={`${i.id}-${index}`}>
            <label>
              <span>{i.name}</span>
              <input
                aria-label={`Quantity ${i.name}`}
                type="number"
                required
                min="0.001"
                max="1000"
                step="0.001"
                value={i.quantity}
                onChange={(e) =>
                  setIngredients((old) =>
                    old.map((x, n) =>
                      n === index
                        ? { ...x, quantity: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
              <select
                aria-label={`Unit ${i.name}`}
                value={i.unit}
                onChange={(e) =>
                  setIngredients((old) =>
                    old.map((x, n) =>
                      n === index ? { ...x, unit: e.target.value } : x,
                    ),
                  )
                }
              >
                {[
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
                ].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ingredient ${i.name}`}
              onClick={() =>
                setIngredients((old) => old.filter((x, n) => n !== index))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function NewRecipe({ onClose }: { onClose: () => void }) {
  const { act, busy } = useApp();
  const [ingredients, setIngredients] = useState<Recipe["ingredients"]>([]);
  return (
    <Modal title="A new recipe at the family table" onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await act(
              "/recipes",
              "POST",
              {
                title: f.get("title"),
                category: f.get("category"),
                cuisine: f.get("cuisine"),
                protein: f.get("protein"),
                cut: f.get("cut"),
                vegetables: f.get("vegetables"),
                description: f.get("description"),
                prep: Number(f.get("prep")),
                cook: Number(f.get("cook")),
                servings: Number(f.get("servings")),
                ingredients: ingredients.map((i) => ({
                  id: i.id,
                  quantity: i.quantity,
                  unit: i.unit,
                  note: i.note || "",
            form: i.form || "as_purchased",
            substitutions: i.substitutions || [],
                })),
                steps: String(f.get("steps"))
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                notes: f.get("notes"),
                dairy: f.get("dairy") === "on",
                egg: f.get("egg") === "on",
                glutenFree: true,
              },
              "New family recipe saved. It will join the next voting round.",
            );
            onClose();
          } catch {}
        }}
      >
        <label>
          Recipe name
          <input name="title" required maxLength={160} />
        </label>
        <div className="form-row">
          <label>
            Category
            <select name="category">
              {["Dinner", "Side", "Lunch & leftovers", "Baking"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Cuisine
            <input name="cuisine" required maxLength={80} />
          </label>
        </div>
        <label>
          Description
          <textarea name="description" required maxLength={1500} />
        </label>
        <div className="form-row">
          <label>
            Protein type
            <select name="protein">
              {[
                "Chicken",
                "Beef",
                "Pork",
                "Lamb",
                "Fish",
                "Shrimp",
                "Turkey & beef",
                "Vegetarian",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Exact protein cut
            <input
              name="cut"
              required
              minLength={5}
              maxLength={250}
              placeholder="e.g. Chicken thighs, boneless skinless"
            />
          </label>
        </div>
        <label>
          Vegetable or explicit side
          <input name="vegetables" required minLength={3} maxLength={250} />
        </label>
        <div className="form-row">
          <label>
            Prep time (minutes)
            <input
              name="prep"
              type="number"
              min="0"
              max="1440"
              required
              defaultValue="15"
            />
          </label>
          <label>
            Cooking time (minutes)
            <input
              name="cook"
              type="number"
              min="0"
              max="1440"
              required
              defaultValue="30"
            />
          </label>
        </div>
        <label>
          Generous base portions (or cookie yield)
          <input
            name="servings"
            type="number"
            min="0.5"
            max="1000"
            step="0.5"
            required
            defaultValue="3"
          />
        </label>
        <div className="check-row">
          <label>
            <input type="checkbox" name="dairy" />
            Contains dairy
          </label>
          <label>
            <input type="checkbox" name="egg" />
            Contains eggs
          </label>
        </div>
        <p className="notice">
          Use gluten-free ingredients. Every dinner must include a vegetable
          ingredient or side. Choose exact cuts from the catalog so shopping
          quantities consolidate safely. The recipe starts as never tried.
        </p>
        <IngredientBuilder
          ingredients={ingredients}
          setIngredients={setIngredients}
        />
        <label>
          Cooking steps (one per line, include temperatures)
          <textarea name="steps" required rows={6} />
        </label>
        <label>
          Notes and substitutions
          <textarea name="notes" maxLength={5000} />
        </label>
        <button className="primary full" disabled={busy || !ingredients.length}>
          Save our new recipe
        </button>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
