import React, { useState, useMemo } from "react";
import { useFireproof } from "use-fireproof";
import { useViewer, useVibe } from "use-vibes";
import { callAI } from "call-ai";

// ── Grocery Live (system/grocery-live) ───────────────────────────────────────
// The grocery branch of the /start Productive lane (#3080): lists become
// STORES (the store picker is the app title — kanban-live's sheet pattern),
// and sharing is WHOLE-HOUSEHOLD: one channel, one membership for everything —
// deliberately coarser than lists-live's per-list friends. You live in your
// own household; a switcher appears only if you've been invited to another.
//
// The special feature is the RECIPE BOX at the top: type "lasagna" and callAI
// (JSON schema {ingredients:[{name, quantity?}]}) adds deduped unchecked items
// to the active store, visibly tagged ✨ with the recipe they came from.
// Checked items collapse into an "In the cart" section — grocery lists are
// REUSED, so unchecking puts things back on the list, and Clear-cart tidies up
// after a shop.
//
// LOCAL-FIRST pre-invite: anonymousLocal runs the whole thing against a
// localStorage store while logged out, migrating into the cloud (and your
// implicit household) on first sign-in.

const DB = "grocery";

const INGREDIENTS_SCHEMA = {
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
};

const normName = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

// Local → cloud migration on first sign-in: anonymous-era stores and items
// re-home onto the new user's implicit household. Members can't exist
// pre-login — drop strays.
const migrateGroceryDoc = (doc, handle) => {
  if (doc.type === "item" || doc.type === "store") return { ...doc, householdId: handle, authorHandle: handle };
  return null;
};

export default function App() {
  const { useDocument, useLiveQuery, database } = useFireproof(DB, {
    anonymousLocal: true,
    migrate: migrateGroceryDoc,
  });
  const { viewer, ViewerTag, HandleInput } = useViewer();
  const { can, ready, me } = useVibe(DB);

  const signedIn = !!viewer?.userHandle;
  const myHandle = me?.userHandle || viewer?.userHandle;
  const myHome = myHandle || "anon";

  const { doc: draft, merge: mergeDraft } = useDocument({ text: "" });
  const { doc: recipeDraft, merge: mergeRecipe } = useDocument({ q: "" });
  const { docs: itemDocs } = useLiveQuery("type", { key: "item" });
  const { docs: storeDocs } = useLiveQuery("type", { key: "store" });
  const { docs: memberDocs } = useLiveQuery("type", { key: "member" });

  // Which household? Yours, unless you've been invited elsewhere and switched.
  const [homeChoice, setHomeChoiceState] = useState(() => {
    try {
      return localStorage.getItem("grocery-live-home") || "mine";
    } catch {
      return "mine";
    }
  });
  // Which store? "default" is the built-in Groceries store (no doc).
  const [storeChoice, setStoreChoiceState] = useState(() => {
    try {
      return localStorage.getItem("grocery-live-store") || "default";
    } catch {
      return "default";
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [notice, setNotice] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [lastRecipe, setLastRecipe] = useState(null);

  const sharedHouseholds = useMemo(() => {
    const ids = new Set();
    for (const m of memberDocs) {
      if (myHandle && m.userHandle === myHandle && m.householdId && m.householdId !== myHome) ids.add(m.householdId);
    }
    return [...ids].sort();
  }, [memberDocs, myHandle, myHome]);

  const activeHouseholdId = homeChoice === "mine" || !sharedHouseholds.includes(homeChoice) ? myHome : homeChoice;
  const isMyHousehold = activeHouseholdId === myHome;

  const householdStores = [...storeDocs]
    .filter((s) => (s.householdId || myHome) === activeHouseholdId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const stores = [{ _id: "default", name: "Groceries" }, ...householdStores];
  const activeStoreDoc = householdStores.find((s) => s._id === storeChoice);
  const activeStoreId = storeChoice === "default" || activeStoreDoc ? storeChoice : "default";
  const storeName = stores.find((s) => s._id === activeStoreId)?.name || "Groceries";
  const isRealStore = !!activeStoreDoc && activeStoreId !== "default";

  const householdItems = useMemo(
    () => itemDocs.filter((i) => (i.householdId || myHome) === activeHouseholdId),
    [itemDocs, activeHouseholdId, myHome]
  );
  const storeItems = householdItems.filter((i) => (i.storeId || "default") === activeStoreId);
  const openItems = storeItems.filter((i) => !i.checked).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const cartItems = storeItems.filter((i) => i.checked).sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
  const itemCountFor = (id) => householdItems.filter((i) => !i.checked && (i.storeId || "default") === id).length;
  const householdMembers = memberDocs.filter((m) => m.householdId === activeHouseholdId);

  function switchHome(choice) {
    setHomeChoiceState(choice);
    setStoreChoiceState("default");
    try {
      localStorage.setItem("grocery-live-home", choice);
      localStorage.setItem("grocery-live-store", "default");
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  function switchStore(id, knownName) {
    setStoreChoiceState(id);
    setRenameDraft(knownName || stores.find((s) => s._id === id)?.name || "Groceries");
    try {
      localStorage.setItem("grocery-live-store", id);
    } catch {
      /* per-device nicety only */
    }
    setSheetOpen(false);
  }

  function openSheet() {
    setRenameDraft(storeName);
    setDeleteArmed(false);
    setSheetOpen(true);
  }

  const createVerdict =
    signedIn && ready ? can.create({ type: "item", householdId: activeHouseholdId, authorHandle: myHandle }) : null;
  const canWrite = signedIn ? !!createVerdict?.ok : true;
  // Invites are founder-only (access.js) — the verdict returns false when
  // you're visiting another household, and the UI hides the form. Probe with
  // a concrete userHandle — the fn validates the grantee id, so a handle-less
  // probe would throw instead of answering.
  const canInvite =
    signedIn && ready
      ? !!can.create({ type: "member", householdId: activeHouseholdId, userHandle: myHandle, addedBy: myHandle }).ok
      : false;

  async function guarded(write) {
    try {
      setNotice(null);
      await write();
    } catch (e) {
      setNotice(signedIn ? e?.message || "That change was not allowed." : "Sign in to keep using your list on this device.");
    }
  }

  async function putItem(fields) {
    return database.put({
      type: "item",
      checked: false,
      storeId: activeStoreId,
      householdId: activeHouseholdId,
      createdAt: Date.now(),
      authorHandle: myHandle,
      ...fields,
    });
  }

  async function addItem(e) {
    e.preventDefault();
    const name = draft.text.trim();
    if (!name || !canWrite) return;
    mergeDraft({ text: "" });
    await guarded(() => putItem({ name }));
  }

  async function toggleItem(item) {
    if (!canWrite) return;
    await guarded(() => database.put({ ...item, checked: !item.checked, checkedAt: item.checked ? 0 : Date.now() }));
  }

  async function deleteItem(item) {
    if (!canWrite) return;
    await guarded(() => database.del(item._id));
  }

  async function clearCart() {
    if (!canWrite || cartItems.length === 0) return;
    await guarded(() => Promise.all(cartItems.map((i) => database.del(i._id))));
  }

  // The recipe box: schema-forced callAI, then dedupe by normalized name
  // against the store's UNCHECKED items (checked ones re-add — you need more).
  async function suggestIngredients(e) {
    e.preventDefault();
    const q = recipeDraft.q.trim();
    if (!q || !canWrite || suggesting) return;
    setSuggesting(true);
    setNotice(null);
    try {
      const raw = await callAI(
        `List the grocery ingredients needed to cook "${q}". Common pantry staples (salt, pepper, water) can be skipped. Give practical shopping quantities.`,
        { schema: INGREDIENTS_SCHEMA }
      );
      const parsed = JSON.parse(raw);
      const have = new Set(openItems.map((i) => normName(i.name)));
      const fresh = (parsed.ingredients || []).filter((ing) => ing?.name && !have.has(normName(ing.name)));
      for (const ing of fresh) {
        have.add(normName(ing.name));
        const fields = { name: ing.name.trim(), suggestedFrom: q };
        if (ing.quantity && String(ing.quantity).trim()) fields.quantity = String(ing.quantity).trim();
        await putItem(fields);
      }
      mergeRecipe({ q: "" });
      setLastRecipe({ q, added: fresh.length, skipped: (parsed.ingredients || []).length - fresh.length });
    } catch (err) {
      setNotice(
        signedIn
          ? `Couldn't get suggestions: ${err?.message || "try again"}`
          : "Couldn't get suggestions — sign in and try again."
      );
    } finally {
      setSuggesting(false);
    }
  }

  async function createStore(e) {
    e.preventDefault();
    const name = newStoreName.trim();
    if (!name || !canWrite) return;
    setNewStoreName("");
    await guarded(async () => {
      const res = await database.put({
        type: "store",
        name,
        householdId: activeHouseholdId,
        createdAt: Date.now(),
        authorHandle: myHandle,
      });
      switchStore(res.id, name);
    });
  }

  async function renameStore(e) {
    e.preventDefault();
    const name = renameDraft.trim();
    if (!name || !activeStoreDoc || !canWrite) return;
    setSheetOpen(false);
    await guarded(() => database.put({ ...activeStoreDoc, name }));
  }

  // Two-tap delete sweeps the store's items, then lands back on Groceries.
  async function deleteStore() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    if (!activeStoreDoc || !canWrite) return;
    const doomed = householdItems.filter((i) => (i.storeId || "default") === activeStoreId);
    switchStore("default");
    await guarded(() => Promise.all([...doomed.map((d) => database.del(d._id)), database.del(activeStoreDoc._id)]));
  }

  // `handle` arrives pre-sanitized from HandleInput (picked handles are real
  // users; raw entry is server-slug-sanitized), so no normalization here.
  async function addMember(handle) {
    if (!handle || !canInvite) return;
    if (handle === myHandle || householdMembers.some((m) => m.userHandle === handle)) return;
    await guarded(() =>
      database.put({
        type: "member",
        householdId: activeHouseholdId,
        userHandle: handle,
        addedBy: myHandle,
        createdAt: Date.now(),
      })
    );
  }

  async function removeMember(m) {
    await guarded(() => database.del(m._id));
  }

  function ItemRow({ item }) {
    return (
      <div
        className="bg-[#ffffff] border-4 border-[#242424] px-3 py-3 mb-2 select-none cursor-pointer active:opacity-70 flex items-center gap-3"
        onClick={() => toggleItem(item)}
      >
        <span
          className={`shrink-0 w-7 h-7 border-4 border-[#242424] flex items-center justify-center text-base font-bold ${item.checked ? "bg-[#e9ff70]" : "bg-[#ffffff]"}`}
        >
          {item.checked ? "✓" : ""}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={`block font-bold text-[#242424] text-base leading-tight ${item.checked ? "line-through opacity-50" : ""}`}
          >
            {item.name}
            {item.quantity ? <span className="font-normal opacity-60 text-sm"> · {item.quantity}</span> : null}
          </span>
          {item.suggestedFrom && (
            <span className="inline-block mt-1 text-[0.6rem] font-bold text-[#242424] bg-[#e9ff70] border-2 border-[#242424] px-1.5 py-0.5">
              ✨ {item.suggestedFrom}
            </span>
          )}
        </span>
        {canWrite && (
          <button
            aria-label={`Delete ${item.name}`}
            onClick={(e) => {
              e.stopPropagation();
              deleteItem(item);
            }}
            className="shrink-0 w-8 h-8 border-2 border-[#242424] bg-[#ffffff] font-bold text-[#242424] active:bg-[#ff70a6]"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-4 bg-[#ff70a6]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23242424' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="max-w-md mx-auto">
        {/* The STORE is the title — tap to switch stores or manage the household. */}
        <header className="mb-3 flex items-end justify-between px-1">
          <button onClick={openSheet} className="text-left">
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60">
              Grocery Live{isMyHousehold ? "" : ` · @${activeHouseholdId}'s home`}
            </span>
            <h1 className="text-xl md:text-3xl font-bold text-[#242424] leading-tight">
              {storeName} <span className="text-sm md:text-xl align-middle">▾</span>
            </h1>
          </button>
          <span className="text-xs md:text-sm font-bold text-[#242424] opacity-70">
            {openItems.length} to buy
          </span>
        </header>

        {/* The recipe box — the lane's callAI showcase. */}
        {canWrite && (
          <form onSubmit={suggestIngredients} className="bg-[#ffd670] border-4 border-[#242424] p-3 mb-3">
            <span className="block text-[0.6rem] uppercase tracking-widest font-bold text-[#242424] opacity-60 mb-1">
              Recipe box — what are you cooking?
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="lasagna, pad thai, birthday cake..."
                value={recipeDraft.q}
                onChange={(e) => mergeRecipe({ q: e.target.value })}
                className="flex-1 min-w-0 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base bg-[#ffffff]"
              />
              <button
                type="submit"
                disabled={suggesting}
                className="min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] px-4 font-bold text-[#242424] active:bg-[#70d6ff] disabled:opacity-60"
              >
                {suggesting ? "..." : "✨ Add"}
              </button>
            </div>
            {lastRecipe && (
              <p className="text-xs font-bold text-[#242424] mt-2">
                Added {lastRecipe.added} ingredient{lastRecipe.added === 1 ? "" : "s"} for "{lastRecipe.q}"
                {lastRecipe.skipped > 0 ? ` (${lastRecipe.skipped} already on the list)` : ""}
              </p>
            )}
          </form>
        )}

        {canWrite ? (
          <form onSubmit={addItem} className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 flex gap-2">
            <input
              type="text"
              placeholder={`Add to ${storeName}...`}
              value={draft.text}
              onChange={(e) => mergeDraft({ text: e.target.value })}
              className="flex-1 min-w-0 min-h-[48px] p-3 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50 text-base"
            />
            <button
              type="submit"
              className="min-h-[48px] bg-[#e9ff70] border-4 border-[#242424] px-4 font-bold text-[#242424] active:bg-[#70d6ff]"
            >
              Add
            </button>
          </form>
        ) : (
          ready && (
            <div className="bg-[#ffffff] border-4 border-[#242424] p-3 mb-3 text-center">
              <p className="font-bold text-[#242424] text-sm">
                {signedIn
                  ? createVerdict?.reason || "Read-only — ask a household member to add you."
                  : "Households are private — sign in to see and edit yours."}
              </p>
            </div>
          )
        )}

        {notice && (
          <div className="bg-[#ffd670] border-4 border-[#242424] p-2 mb-3 text-center">
            <p className="font-bold text-[#242424] text-xs">{notice}</p>
          </div>
        )}

        <div
          className="min-h-[30vh] p-3 border-4 border-[#242424] bg-[#ffffff] bg-opacity-50"
          style={{
            backgroundImage: `radial-gradient(circle at 20px 20px, #242424 3px, transparent 3px)`,
            backgroundSize: "40px 40px",
          }}
        >
          {openItems.length === 0 && (
            <p className="text-center font-bold text-[#242424] opacity-60 py-8">
              Nothing to buy — add items above, or ask the recipe box.
            </p>
          )}
          {openItems.map((item) => (
            <ItemRow key={item._id} item={item} />
          ))}
        </div>

        {/* Checked items collapse into the cart — grocery lists are reused, so
            unchecking puts things back on the list. */}
        {cartItems.length > 0 && (
          <div className="mt-3 border-4 border-[#242424] bg-[#ffffff]">
            <button
              onClick={() => setCartOpen((o) => !o)}
              className="w-full min-h-[48px] px-3 font-bold text-left text-[#242424] flex items-center justify-between"
            >
              <span>🛒 In the cart ({cartItems.length})</span>
              <span>{cartOpen ? "▾" : "▸"}</span>
            </button>
            {cartOpen && (
              <div className="p-3 pt-0">
                {cartItems.map((item) => (
                  <ItemRow key={item._id} item={item} />
                ))}
                {canWrite && (
                  <button
                    onClick={clearCart}
                    className="w-full min-h-[44px] px-3 border-2 border-[#d94f3d] text-[#d94f3d] bg-[#ffffff] font-bold text-sm active:bg-[#d94f3d] active:text-white"
                  >
                    Clear the cart
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center px-1 pt-2 pb-20">
          <span className="text-xs font-bold text-[#242424] opacity-70">Tap the title for stores &amp; household</span>
          {!signedIn && <span className="text-xs font-bold text-[#242424] opacity-70">On this device — sign in to share</span>}
        </div>
      </div>

      {/* Store + household sheet. No dim; tap-outside catcher; pb-16 keeps
          taps clear of the host page's Vibes switch pill (#3076). */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setSheetOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:bottom-10 md:w-[380px] md:-translate-x-1/2 bg-[#ffffff] border-t-4 md:border-4 border-[#242424] p-4 pb-16 md:pb-4 space-y-2 max-h-[70vh] overflow-y-auto"
            style={{ boxShadow: "0 -6px 0 #242424" }}
          >
            {!signedIn && (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">Share the shopping</h3>
                <p className="text-sm font-bold text-[#242424]">
                  Your list lives on this device. Sign in to sync it and share one household list with everyone at home.
                </p>
                <div className="flex justify-center py-1">
                  <ViewerTag />
                </div>
              </>
            )}
            {signedIn && canWrite && (
              <>
                <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest">
                  {isMyHousehold ? "My household" : `@${activeHouseholdId}'s household`}
                </h3>
                {/* ONE membership for everything — deliberately coarser than
                    per-list friends. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#242424] opacity-60 uppercase tracking-widest">Household</span>
                  <span className="text-sm font-bold text-[#242424]">@{activeHouseholdId}</span>
                  {householdMembers.map((m) => (
                    <span
                      key={m._id}
                      className="text-sm font-bold text-[#242424] bg-[#ffd670] border-2 border-[#242424] px-2 py-0.5 inline-flex items-center gap-1"
                    >
                      @{m.userHandle}
                      {(canInvite || m.userHandle === myHandle) && (
                        <button aria-label={`Remove @${m.userHandle}`} onClick={() => removeMember(m)} className="font-bold">
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canInvite && (
                  /* Platform people-picker: autocompletes handles you've
                     interacted with, then global matches. Inviting happens on
                     pick; the always-null value keeps the field ready for the
                     next member (the new member shows in the row above). */
                  <HandleInput
                    value={null}
                    onChange={addMember}
                    placeholder="Add someone to the household..."
                    style={{ display: "block", "--border": "#242424", "--card-bg": "#ffffff", "--text": "#242424", "--muted": "#5c5c5c" }}
                  />
                )}
                {sharedHouseholds.length > 0 && (
                  <>
                    <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">Households</h3>
                    <button
                      onClick={() => switchHome("mine")}
                      className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${isMyHousehold ? "bg-[#e9ff70]" : "bg-[#ffffff]"}`}
                    >
                      My household
                    </button>
                    {sharedHouseholds.map((id) => (
                      <button
                        key={id}
                        onClick={() => switchHome(id)}
                        className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${activeHouseholdId === id ? "bg-[#e9ff70]" : "bg-[#ffffff]"}`}
                      >
                        @{id}'s household
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
            <h3 className="font-bold text-[#242424] text-xs uppercase tracking-widest pt-1">Stores</h3>
            {canWrite && isRealStore && (
              <form onSubmit={renameStore} className="flex gap-2">
                <input
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  placeholder="Store name"
                  className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] font-bold"
                />
                <button type="submit" className="min-h-[44px] px-3 bg-[#70d6ff] border-4 border-[#242424] font-bold text-[#242424]">
                  Rename
                </button>
              </form>
            )}
            {canWrite && (
              <form onSubmit={createStore} className="flex gap-2">
                <input
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="New store (Costco, farmers market...)"
                  className="flex-1 min-w-0 min-h-[44px] p-2 border-4 border-[#242424] text-[#242424] placeholder-[#242424] placeholder-opacity-50"
                />
                <button type="submit" className="min-h-[44px] px-4 bg-[#e9ff70] border-4 border-[#242424] font-bold text-[#242424]">
                  Create
                </button>
              </form>
            )}
            {stores.map((s) => (
              <button
                key={s._id}
                onClick={() => switchStore(s._id)}
                className={`w-full min-h-[44px] px-3 border-4 border-[#242424] font-bold text-left text-[#242424] ${s._id === activeStoreId ? "bg-[#e9ff70]" : "bg-[#ffffff]"}`}
              >
                {s.name}
                <span className="float-right text-xs opacity-60 font-normal">{itemCountFor(s._id)}</span>
              </button>
            ))}
            {canWrite && isRealStore && (
              <button
                onClick={deleteStore}
                className={`w-full min-h-[44px] px-3 border-2 font-bold text-sm ${deleteArmed ? "bg-[#d94f3d] text-white border-[#242424]" : "border-[#d94f3d] text-[#d94f3d] bg-[#ffffff]"}`}
              >
                {deleteArmed
                  ? `Really delete "${storeName}" and its ${storeItems.length} item(s)?`
                  : "Delete this store"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
