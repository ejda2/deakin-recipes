import { useState, useEffect, useMemo, useRef } from "react";
import { store, isPreview, SEED } from "./store.js";
import { ADMIN_EMAIL } from "./firebase.js";
import { parseBlocks, paragraphs, CATEGORIES } from "./text.js";

// ─── Hash routing ────────────────────────────────────────────────────────────
// #/                 all recipes
// #/c/<category>     one category
// #/favorites        my favorites
// #/r/<id>           a recipe
// #/r/<id>/edit      edit a recipe
// #/new              add a recipe
// #/admin            admin tools

function parseHash() {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  const [a, b, c] = h.split("/");
  if (a === "r" && b) return { view: c === "edit" ? "edit" : "recipe", id: b };
  if (a === "c" && b) return { view: "list", category: b };
  if (a === "favorites") return { view: "list", favorites: true };
  if (a === "new") return { view: "new" };
  if (a === "admin") return { view: "admin" };
  return { view: "list" };
}

export function go(path) {
  window.location.hash = "#/" + path.split("/").map(encodeURIComponent).join("/");
  window.scrollTo(0, 0);
}

function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Star({ on, onClick, label }) {
  return (
    <button
      type="button"
      className={"star" + (on ? " on" : "")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      aria-pressed={on}
      aria-label={label}
      title={on ? "Remove from favorites" : "Add to favorites"}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" />
      </svg>
    </button>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className={"toast" + (msg.error ? " error" : "")} role="status">{msg.text}</div>;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (text, error = false) => {
    clearTimeout(t.current);
    setMsg({ text, error });
    t.current = setTimeout(() => setMsg(null), error ? 6000 : 2600);
  };
  return [msg, show];
}

function friendlyError(e) {
  if (e?.code === "permission-denied") return "You don't have permission to do that.";
  if (e?.code === "unavailable") return "Can't reach the database. Check your connection and try again.";
  return e?.message || "Something went wrong.";
}

// ─── Sign-in ─────────────────────────────────────────────────────────────────

function SignIn({ onError }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="signin">
      <div className="signin-card">
        <div className="card-rule" />
        <h1>Deakin Family Recipes</h1>
        <p className="signin-sub">
          {SEED.length} family recipes and counting, from Ma Deak's goulash to Lori's focaccia.
          Sign in to browse, add your own, and leave notes for everyone.
        </p>
        <button
          className="btn primary google"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await store.signIn(); } catch (e) { onError(friendlyError(e)); }
            setBusy(false);
          }}
        >
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
        {isPreview && <p className="preview-note">Preview mode: Firebase isn't connected yet, so nothing you do here is saved.</p>}
      </div>
    </div>
  );
}

// ─── Recipe list ─────────────────────────────────────────────────────────────

function RecipeRow({ r, fav, onFav }) {
  return (
    <a className="row" href={`#/r/${encodeURIComponent(r.id)}`}>
      <span className="row-main">
        <span className="row-title">{r.title}</span>
        <span className="row-from">{r.contributorName}</span>
      </span>
      <span className="row-prep">{r.prep}</span>
      <Star on={fav} onClick={onFav} label={`Favorite ${r.title}`} />
    </a>
  );
}

function ListView({ route, recipes, favorites, toggleFav, search, setSearch, onExport }) {
  const [who, setWho] = useState("");
  const contributors = useMemo(
    () => [...new Set(recipes.map((r) => r.contributorName).filter(Boolean))].sort(),
    [recipes]
  );

  const q = search.trim().toLowerCase();
  const filtered = recipes.filter((r) => {
    if (route.category && r.category !== route.category) return false;
    if (route.favorites && !favorites.has(r.id)) return false;
    if (who && r.contributorName !== who) return false;
    if (q) {
      const hay = `${r.title}\n${r.ingredients}\n${r.contributorName}\n${r.notes}\n${r.category}`.toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  });

  const heading = route.favorites ? "My favorites" : route.category || "All recipes";
  const groups = route.category
    ? [[route.category, filtered]]
    : CATEGORIES.concat([...new Set(filtered.map((r) => r.category))].filter((c) => !CATEGORIES.includes(c)))
        .map((c) => [c, filtered.filter((r) => r.category === c)])
        .filter(([, list]) => list.length);

  return (
    <main className="list-main">
      <div className="list-head">
        <h1>{heading}</h1>
        <span className="count">{filtered.length} {filtered.length === 1 ? "recipe" : "recipes"}</span>
      </div>
      <div className="filters">
        <label className="sr-only" htmlFor="who">Contributor</label>
        <select id="who" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">From anyone</option>
          {contributors.map((c) => <option key={c} value={c}>From {c}</option>)}
        </select>
        {q && <button className="btn link" onClick={() => setSearch("")}>Clear search</button>}
        <button className="btn ghost" onClick={() => onExport(filtered, route.favorites ? "My favorites" : route.category || null)} disabled={!filtered.length}>
          Save these as PDF
        </button>
      </div>

      {!filtered.length && (
        <div className="empty">
          {route.favorites ? (
            <p>Tap the star on any recipe to keep it here.</p>
          ) : recipes.length === 0 ? (
            <p>No recipes yet. <a href="#/new">Add the first one</a>.</p>
          ) : (
            <p>Nothing matches. Try a different word, or <button className="btn link" onClick={() => { setSearch(""); setWho(""); }}>show everything</button>.</p>
          )}
        </div>
      )}

      {groups.map(([cat, list]) => (
        <section key={cat} className="group">
          {!route.category && <h2 className="group-title">{cat}</h2>}
          <div className="rows">
            {list
              .slice()
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((r) => (
                <RecipeRow key={r.id} r={r} fav={favorites.has(r.id)} onFav={() => toggleFav(r.id)} />
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}

// ─── Recipe detail ───────────────────────────────────────────────────────────

function Blocks({ text, numbered }) {
  const blocks = parseBlocks(text);
  const out = [];
  let items = [];
  const flush = (k) => {
    if (!items.length) return;
    const L = numbered ? "ol" : "ul";
    out.push(<L key={"l" + k}>{items}</L>);
    items = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === "head") { flush(i); out.push(<h4 key={"h" + i}>{b.text}</h4>); }
    else items.push(<li key={i}>{b.text}</li>);
  });
  flush("end");
  return out;
}

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

function Comments({ recipeId, user, isAdmin, toast }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => store.onComments(recipeId, setList), [recipeId]);

  const post = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try { await store.addComment(recipeId, t.slice(0, 2000), user); setText(""); }
    catch (err) { toast(friendlyError(err), true); }
    setBusy(false);
  };

  return (
    <section className="comments no-print">
      <h3>Comments{list.length ? ` (${list.length})` : ""}</h3>
      {list.length === 0 && <p className="muted">No comments yet. Made it? Tell everyone how it went.</p>}
      <ul className="comment-list">
        {list.map((c) => (
          <li key={c.id}>
            <div className="comment-meta">
              <strong>{c.name}</strong> <span className="muted">{fmtDate(c.createdAt)}</span>
              {(c.uid === user.uid || isAdmin) && (
                <button className="btn link small" onClick={async () => {
                  if (!window.confirm("Delete this comment?")) return;
                  try { await store.deleteComment(recipeId, c.id); } catch (err) { toast(friendlyError(err), true); }
                }}>Delete</button>
              )}
            </div>
            <p>{c.text}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={post} className="comment-form">
        <label className="sr-only" htmlFor="newc">Add a comment</label>
        <textarea id="newc" rows={3} maxLength={2000} placeholder="Add a comment" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? "Posting…" : "Post comment"}</button>
      </form>
    </section>
  );
}

function RecipeView({ recipe, user, isAdmin, canEdit, fav, toggleFav, toast, onExportOne }) {
  if (!recipe) return <main className="detail"><p className="empty">That recipe isn't here. It may have been deleted. <a href="#/">Back to all recipes</a></p></main>;
  const notes = paragraphs(recipe.notes);
  return (
    <main className="detail">
      <div className="detail-actions no-print">
        <a className="btn link" href={`#/c/${encodeURIComponent(recipe.category)}`}>‹ {recipe.category}</a>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => window.print()}>Print</button>
        <button className="btn ghost" onClick={() => onExportOne(recipe)}>Save PDF</button>
        {canEdit && <a className="btn ghost" href={`#/r/${encodeURIComponent(recipe.id)}/edit`}>Edit</a>}
      </div>

      <article className="card">
        <header className="card-head">
          <div className="card-title-row">
            <h1>{recipe.title}</h1>
            <span className="no-print"><Star on={fav} onClick={toggleFav} label={`Favorite ${recipe.title}`} /></span>
          </div>
          <p className="card-meta">
            <span className="from">from {recipe.contributorName}</span>
            {recipe.prep && <span className="prep">Prep/cook time: {recipe.prep}</span>}
            <span className="print-only">{recipe.category}</span>
          </p>
        </header>
        <div className="card-body">
          <section className="ingredients">
            <h3>Ingredients</h3>
            <Blocks text={recipe.ingredients} />
          </section>
          <section className="directions">
            <h3>Directions</h3>
            <Blocks text={recipe.directions} numbered />
          </section>
        </div>
        {notes.length > 0 && (
          <section className="notes">
            <h3>Notes</h3>
            {notes.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        )}
        {recipe.updatedByName && (
          <p className="updated no-print">
            {recipe.ownerUid === null && recipe.updatedByName.startsWith("Imported")
              ? "From the original family workbook"
              : `Last edited by ${recipe.updatedByName}${recipe.updatedAt ? " on " + fmtDate(recipe.updatedAt) : ""}`}
          </p>
        )}
      </article>

      <Comments recipeId={recipe.id} user={user} isAdmin={isAdmin} toast={toast} />
    </main>
  );
}

// ─── Add / edit ──────────────────────────────────────────────────────────────

function RecipeForm({ recipe, user, me, isAdmin, contributors, toast }) {
  const isNew = !recipe;
  const defaultName = me.linkedName || user.displayName || user.email;
  const [f, setF] = useState(() => ({
    title: recipe?.title || "",
    category: recipe?.category || "",
    prep: recipe?.prep || "",
    ingredients: recipe?.ingredients || "",
    directions: recipe?.directions || "",
    notes: recipe?.notes || "",
    contributorName: recipe?.contributorName || defaultName,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Give the recipe a name.");
    if (!f.category) return setErr("Pick a category.");
    if (!f.ingredients.trim() && !f.directions.trim()) return setErr("Add the ingredients or directions.");
    setErr("");
    setBusy(true);
    const data = {
      title: f.title.trim(),
      category: f.category,
      prep: f.prep.trim(),
      ingredients: f.ingredients.trim(),
      directions: f.directions.trim(),
      notes: f.notes.trim(),
    };
    if (isNew) data.contributorName = isAdmin ? f.contributorName.trim() || defaultName : defaultName;
    else if (isAdmin) data.contributorName = f.contributorName.trim() || recipe.contributorName;
    try {
      if (isNew) {
        const id = await store.createRecipe(data, user);
        toast("Recipe added");
        go(`r/${id}`);
      } else {
        await store.updateRecipe(recipe.id, data, user);
        toast("Changes saved");
        go(`r/${recipe.id}`);
      }
    } catch (e2) {
      setErr(friendlyError(e2));
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${recipe.title}" for everyone? This can't be undone.`)) return;
    try { await store.deleteRecipe(recipe.id); toast("Recipe deleted"); go(""); }
    catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <main className="detail">
      <form className="card form" onSubmit={save}>
        <header className="card-head">
          <h1>{isNew ? "Add a recipe" : "Edit recipe"}</h1>
        </header>
        <div className="form-body">
          <label>Recipe name
            <input value={f.title} onChange={set("title")} maxLength={150} autoFocus={isNew} />
          </label>
          <div className="form-row">
            <label>Category
              <select value={f.category} onChange={set("category")}>
                <option value="">Choose one</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Prep/cook time
              <input value={f.prep} onChange={set("prep")} maxLength={150} placeholder="e.g. 45 minutes" />
            </label>
          </div>
          {isAdmin ? (
            <label>Contributor
              <input value={f.contributorName} onChange={set("contributorName")} list="contributors" maxLength={80} />
              <datalist id="contributors">{contributors.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          ) : (
            <p className="muted">Shared as <strong>{isNew ? defaultName : recipe.contributorName}</strong></p>
          )}
          <label>Ingredients
            <span className="hint">One per line. End a line with a colon to make a heading, like "For the sauce:"</span>
            <textarea rows={10} value={f.ingredients} onChange={set("ingredients")} />
          </label>
          <label>Directions
            <span className="hint">One step per line. Steps are numbered automatically.</span>
            <textarea rows={12} value={f.directions} onChange={set("directions")} />
          </label>
          <label>Notes
            <span className="hint">Optional: tips, substitutions, where the recipe came from</span>
            <textarea rows={4} value={f.notes} onChange={set("notes")} />
          </label>
          {err && <p className="form-error" role="alert">{err}</p>}
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>{busy ? "Saving…" : isNew ? "Add recipe" : "Save changes"}</button>
            <a className="btn ghost" href={isNew ? "#/" : `#/r/${encodeURIComponent(recipe.id)}`}>Cancel</a>
            <span className="spacer" />
            {!isNew && <button type="button" className="btn danger" onClick={remove}>Delete recipe</button>}
          </div>
        </div>
      </form>
    </main>
  );
}

// ─── Admin ───────────────────────────────────────────────────────────────────

function AdminView({ recipes, contributors, toast }) {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  useEffect(() => store.onUsers(setUsers), []);
  const missing = SEED.filter((s) => !recipes.some((r) => r.id === s.id)).length;

  return (
    <main className="detail">
      <section className="card admin">
        <header className="card-head"><h1>Admin</h1></header>
        <div className="form-body">
          <h3>Starter recipes</h3>
          <p>
            {missing === 0
              ? `All ${SEED.length} recipes from the family workbook are in the cookbook.`
              : `${missing} of the ${SEED.length} workbook recipes aren't in the cookbook yet. Importing adds only the missing ones and never overwrites edits.`}
          </p>
          {missing > 0 && (
            <button className="btn primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const n = await store.importSeed(); toast(`Imported ${n} recipes`); }
              catch (e) { toast(friendlyError(e), true); }
              setBusy(false);
            }}>{busy ? "Importing…" : `Import ${missing} recipes`}</button>
          )}

          <h3>Family members</h3>
          <p>
            Link a person to a contributor name so they can edit the recipes listed under that name.
            For example, link Rich's Google account to "Rich" and he can edit the eight recipes he contributed.
            Recipes people add themselves are always theirs to edit.
          </p>
          {users.length === 0 && <p className="muted">Nobody has signed in yet.</p>}
          <div className="user-table">
            {users
              .slice()
              .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
              .map((u) => {
                const val = drafts[u.uid] ?? u.linkedName ?? "";
                const changed = val !== (u.linkedName ?? "");
                return (
                  <div className="user-row" key={u.uid}>
                    <div className="user-id">
                      <strong>{u.name}</strong>
                      <span className="muted">{u.email}{u.email === ADMIN_EMAIL ? " (admin)" : ""}</span>
                    </div>
                    <label className="sr-only" htmlFor={"ln" + u.uid}>Contributor name for {u.name}</label>
                    <input id={"ln" + u.uid} list="contributors-admin" placeholder="Not linked" value={val}
                      onChange={(e) => setDrafts({ ...drafts, [u.uid]: e.target.value })} />
                    <button className="btn ghost" disabled={!changed} onClick={async () => {
                      try {
                        await store.setLinkedName(u.uid, val.trim());
                        setDrafts({ ...drafts, [u.uid]: undefined });
                        toast(val.trim() ? `Linked ${u.name} to "${val.trim()}"` : `Unlinked ${u.name}`);
                      } catch (e) { toast(friendlyError(e), true); }
                    }}>Save</button>
                  </div>
                );
              })}
          </div>
          <datalist id="contributors-admin">{contributors.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </section>
    </main>
  );
}

// ─── Export dialog ───────────────────────────────────────────────────────────

function ExportDialog({ open, onClose, recipes, favorites, preset, toast }) {
  const [scope, setScope] = useState("all");
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    if (open) {
      if (preset?.label === "My favorites") setScope("favorites");
      else if (preset?.label && CATEGORIES.includes(preset.label)) { setScope("category"); setCat(preset.label); }
      else if (preset?.list && preset.list.length !== recipes.length) setScope("current");
      else setScope("all");
      ref.current.showModal?.();
    } else ref.current.close?.();
  }, [open]);

  const pick = () => {
    if (scope === "favorites") return [recipes.filter((r) => favorites.has(r.id)), "My favorites"];
    if (scope === "category") return [recipes.filter((r) => r.category === cat), cat];
    if (scope === "current") return [preset?.list || [], "Selected recipes"];
    return [recipes, "The complete collection"];
  };
  const [list] = pick();

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <h2>Save a PDF cookbook</h2>
      <p className="muted">Each recipe starts on its own page, with a table of contents up front. Print it or keep the file.</p>
      <fieldset>
        <legend className="sr-only">Which recipes</legend>
        <label className="radio"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Every recipe ({recipes.length})</label>
        <label className="radio"><input type="radio" checked={scope === "favorites"} onChange={() => setScope("favorites")} /> My favorites ({favorites.size})</label>
        <label className="radio"><input type="radio" checked={scope === "category"} onChange={() => setScope("category")} /> One category
          <select value={cat} onChange={(e) => { setCat(e.target.value); setScope("category"); }}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {preset?.list && preset.list.length !== recipes.length && (
          <label className="radio"><input type="radio" checked={scope === "current"} onChange={() => setScope("current")} /> The {preset.list.length} recipes on screen now</label>
        )}
      </fieldset>
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !list.length} onClick={async () => {
          setBusy(true);
          try {
            const [l, label] = pick();
            const { exportCookbook } = await import("./pdf.js");
            await exportCookbook(l, { label });
            onClose();
          } catch (e) { toast("Couldn't build the PDF: " + (e.message || e), true); }
          setBusy(false);
        }}>{busy ? "Building PDF…" : `Save PDF (${list.length})`}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
}

// ─── App shell ───────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(undefined);
  const [toastMsg, toast] = useToast();

  useEffect(() => store.onAuth((u) => {
    setUser(u || null);
    if (u) store.touchUser(u).catch(() => {});
  }), []);

  if (user === undefined) return <div className="loading">Loading…</div>;
  if (!user) return <><SignIn onError={(m) => toast(m, true)} /><Toast msg={toastMsg} /></>;
  return <Cookbook user={user} toast={toast} toastMsg={toastMsg} />;
}

function Cookbook({ user, toast, toastMsg }) {
  const route = useRoute();
  const [recipes, setRecipes] = useState(null);
  const [me, setMe] = useState({});
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [exportState, setExportState] = useState({ open: false });
  const isAdmin = user.email === ADMIN_EMAIL;

  useEffect(() => store.onRecipes(setRecipes, (e) => toast(friendlyError(e), true)), []);
  useEffect(() => store.onMe(user.uid, setMe), [user.uid]);

  const favorites = useMemo(() => new Set(me.favorites || []), [me.favorites]);
  const toggleFav = (id) => store.setFavorite(user.uid, id, !favorites.has(id)).catch((e) => toast(friendlyError(e), true));
  const canEdit = (r) => isAdmin || r.ownerUid === user.uid || (!!me.linkedName && me.linkedName === r.contributorName);
  const contributors = useMemo(
    () => [...new Set((recipes || []).map((r) => r.contributorName).filter(Boolean))].sort(),
    [recipes]
  );

  // Typing in search from a recipe page jumps back to the list.
  const onSearch = (v) => {
    setSearch(v);
    if (route.view !== "list") go("");
  };

  const counts = useMemo(() => {
    const c = {};
    (recipes || []).forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
    return c;
  }, [recipes]);

  const recipe = route.id && recipes ? recipes.find((r) => r.id === route.id) : null;

  const exportOne = async (r) => {
    try { const { exportRecipe } = await import("./pdf.js"); await exportRecipe(r); }
    catch (e) { toast("Couldn't build the PDF: " + (e.message || e), true); }
  };

  let body;
  if (!recipes) body = <main className="list-main"><p className="muted">Loading recipes…</p></main>;
  else if (route.view === "recipe")
    body = <RecipeView recipe={recipe} user={user} isAdmin={isAdmin} canEdit={recipe && canEdit(recipe)} fav={recipe && favorites.has(recipe.id)} toggleFav={() => toggleFav(recipe.id)} toast={toast} onExportOne={exportOne} />;
  else if (route.view === "edit")
    body = recipe && canEdit(recipe)
      ? <RecipeForm key={recipe.id} recipe={recipe} user={user} me={me} isAdmin={isAdmin} contributors={contributors} toast={toast} />
      : <main className="detail"><p className="empty">{recipe ? "Only the person who added this recipe can edit it." : "That recipe isn't here."} <a href="#/">Back to all recipes</a></p></main>;
  else if (route.view === "new")
    body = <RecipeForm key="new" user={user} me={me} isAdmin={isAdmin} contributors={contributors} toast={toast} />;
  else if (route.view === "admin")
    body = isAdmin ? <AdminView recipes={recipes} contributors={contributors} toast={toast} /> : <main className="detail"><p className="empty">This page is for the cookbook admin.</p></main>;
  else
    body = <ListView route={route} recipes={recipes} favorites={favorites} toggleFav={toggleFav} search={search} setSearch={setSearch}
      onExport={(list, label) => setExportState({ open: true, preset: { list, label } })} />;

  const navCls = (active) => "nav-item" + (active ? " active" : "");
  const inList = route.view === "list";

  return (
    <div className="shell">
      {isPreview && <div className="preview-bar no-print">Preview mode. Firebase isn't connected yet, so changes disappear when you reload.</div>}
      <header className="top no-print">
        <a className="brand" href="#/">Deakin Family Recipes</a>
        <div className="search">
          <label className="sr-only" htmlFor="q">Search recipes</label>
          <input id="q" type="search" placeholder="Search recipes or ingredients" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <a className="btn primary add" href="#/new">Add a recipe</a>
        <div className="me">
          <button className="avatar" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Account menu">
            {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{(user.displayName || user.email || "?")[0]}</span>}
          </button>
          {menu && <div className="menu-backdrop" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              <div className="menu-who"><strong>{user.displayName}</strong><span className="muted">{user.email}</span>
                {me.linkedName && <span className="muted">Contributor name: {me.linkedName}</span>}</div>
              <button onClick={() => setExportState({ open: true, preset: null })}>Save a PDF cookbook</button>
              {isAdmin && <a href="#/admin">Admin</a>}
              <button onClick={() => store.signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="layout">
        <nav className="side no-print" aria-label="Categories">
          <a className={navCls(inList && !route.category && !route.favorites)} href="#/">All recipes <span>{recipes?.length ?? ""}</span></a>
          <a className={navCls(inList && route.favorites)} href="#/favorites">My favorites <span>{favorites.size || ""}</span></a>
          <div className="nav-sep" />
          {CATEGORIES.map((c) => (
            <a key={c} className={navCls((inList && route.category === c) || (recipe && recipe.category === c && !inList))} href={`#/c/${encodeURIComponent(c)}`}>
              {c} <span>{counts[c] || ""}</span>
            </a>
          ))}
        </nav>
        {body}
      </div>

      <ExportDialog open={exportState.open} preset={exportState.preset} onClose={() => setExportState({ open: false })}
        recipes={recipes || []} favorites={favorites} toast={toast} />
      <Toast msg={toastMsg} />
    </div>
  );
}
