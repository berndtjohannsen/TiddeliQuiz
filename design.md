# TiddeliQuiz — Design

Product behaviour is in `readme.md`. This file explains *how* we build it and *why*.

**Status**

- **Iteration 1** (sections 1–12): closed and largely implemented. Live AI on every Start, catalog in JSON, no player login, no question bank.
- **Iteration 2** (from section 13): three roles (guest, logged-in player, admin). Platform catalog vs private catalog. **Stay on JSON files until the UIs are concluded.**

---

# Iteration 1 (built)

---

## 1. What iteration 1 is

A Progressive Web App (PWA): one codebase that runs in a browser and can be installed on a phone.

A player starts a **round**: one domain, a number of questions, a difficulty. The server asks an AI **once** to generate that whole round. The player answers on the phone/browser. An admin UI at `/admin` configures domains, prompts, and which AI engine to call.

Iteration 1 is **online-only**. Generating questions needs the network and the AI provider. Offline play is out of scope.

---

## 2. High-level architecture

```
  Browser / PWA                    Node server
  -------------                    -----------
  Player UI  ---- HTTP ---->  Quiz API  ---->  AI provider
  Admin UI   ---- HTTP ---->  Admin API        (OpenAI-compatible)

  Secrets and AI key stay on the server.
  Domains/prompts live in a local JSON file (no database).
```

**Choice: two parts, one process.** A TypeScript Node server serves the web app and the API. The PWA never talks to the AI provider directly.

**Why:** the AI API key and the admin password must not be shipped to the phone. A single Node process is enough while we have no database and no Netlify deploy.

**Choice: no database in iteration 1.** Config is files + environment variables. A database (SQLite locally, or a hosted DB on Netlify) is deferred until we actually need it (accounts, history, training mode).

---

## 3. Player flow (locked)

1. Choose **one domain**, number of questions (default 10), difficulty (hard / medium / easy / children, default medium).
2. Press Start. The UI waits while the server generates the round.
3. One question at a time. **Options are hidden** until the player presses **Show options**. No free-text answers.
4. Player picks an option:
   - **Correct:** success sound, short explanation, optional external link (e.g. Wikipedia). The player presses **Next** to continue (no auto-advance).
   - **Wrong:** error sound, that option is crossed out, player keeps choosing among the remaining options.
5. **Skip** is available at any time (before or after showing options). Skipped questions are not answered.
6. After the last question (or when none remain), a **summary** is shown.

**Choice: one domain per round.** Selecting several domains in one round is later.

**Choice: children difficulty** only means simpler wording in the AI prompt, not a separate product mode.

**Choice: quiz content is Swedish** for all domains in v1. The prompt must ask for questions, options, explanations, and links in Swedish.

**Choice: UI chrome stays English** in v1 (buttons, labels, admin). Strings live in one module so a second UI language can be added later. No i18n library.

**Choice: Next button** after a correct answer, so the player can read the explanation and optional link.

**Choice: leave space for ads** in the player layout. Do not implement ads in v1.

---

## 4. Scoring (confirmed)

Summary shows **good / bad / skipped**:

- **Good:** the question was answered correctly (even if some wrong options were already crossed out).
- **Bad:** each wrong tap. One question can add several bads.
- **Skipped:** counted separately. Skip is neither good nor a wrong tap.

Example: 10 questions, 8 answered correctly, 3 wrong taps, 2 skipped → **8 good / 3 bad / 2 skipped**.

---

## 5. Admin

**URL:** `/admin` (same app, different route).

**Choice: very simple username and password** for v1. This will be replaced by a real login later. Until then:

- Credentials come from environment variables, not from the browser.
- After login, a server-side session (cookie) protects admin APIs.

Admin can:

- Create/edit **domains** (name, option count default 4, prompt template).
- Set **AI connection**: base URL, API key, model name, optional timeout/temperature.
- View a **debug log** (requests, errors, AI failures). Not a product analytics dashboard.

**Choice: one prompt template per domain.** Difficulty, question count, option count, and content language (Swedish) are substituted into that template. We do not maintain four separate prompts per domain in v1. If a domain needs a very different children prompt, we can add that later.

---

## 6. AI generation

**Choice: one request per round.** When the player presses Start, the server asks the AI to return the full set of questions in one response (e.g. 10 items). Not one request per question.

Each generated item should include:

- question text
- N options (N = domain option count)
- which option is correct
- short explanation
- optional source URL

**Choice: shuffle options on the server** after the AI responds, and remap the correct index. Models often put the right answer first; shuffling avoids that pattern.

**Choice: the app talks OpenAI-compatible HTTP only.** Admin changes engine by changing **base URL + API key + model name**. That covers DeepSeek, OpenAI, Groq, Together, OpenRouter, Ollama, LM Studio, and similar. Native Anthropic/Gemini/Bedrock APIs are not required in v1.

**Choice: default engine is DeepSeek.** It is OpenAI-compatible, so it fits the URL/key/model design with no extra adapter.

| Setting | v1 default |
|---|---|
| Base URL | `https://api.deepseek.com` |
| Model | `deepseek-v4-flash` (cheaper/faster for quiz JSON; admin can switch to `deepseek-v4-pro`) |
| Auth | Bearer API key, server-side only |

Do not use the retired names `deepseek-chat` / `deepseek-reasoner`.

**Choice: one automatic retry, then fail.** If the AI call fails or the JSON does not match the schema, retry the same request **once**. If that also fails, show an error and stay on the start screen. Do not start a broken round.

### Libraries (confirmed; keep the set small)

Each extra package has a job we would otherwise write by hand:

| Package | License | Role |
|---|---|---|
| `ai` (Vercel AI SDK) | Apache-2.0 | Call the model and get structured JSON |
| `@ai-sdk/openai-compatible` | Apache-2.0 | Point at DeepSeek (or any other OpenAI-compatible URL) |
| `zod` | MIT | Validate the quiz JSON before it reaches the player |

Commercial use of these is allowed. Do not add LiteLLM, LangChain, or other AI frameworks.

**Choice: do not use LiteLLM in v1.** LiteLLM’s official product is a Python SDK plus an optional proxy. There is no official Node library. Using it would add a second Python/Docker process. It is useful later as an optional gateway if we need many *native* provider APIs. It does not replace the Node client; the Node app would still speak OpenAI-compatible HTTP to the proxy.

The AI key is set in admin (or env) and **stored only on the server** (environment and/or a git-ignored secrets file). It is never sent to the PWA.

---

## 7. Where data lives (no database)

| Data | Where | Why |
|---|---|---|
| Admin username/password, AI key | Environment variables (and/or git-ignored secrets file) | Secrets must not be in git or in the browser |
| Domains, prompts, option counts, AI URL/model | JSON file on disk | Admin can change them; no DB yet |
| Debug log | Rolling file and/or in-memory list shown in `/admin` | Enough for debugging; lost-on-restart is acceptable |
| Active quiz round | Memory on the server (and/or sent back to the client for that session) | One round at a time; no history |

**Netlify later:** a JSON file will not persist on serverless. Then we need env-only config or a hosted database. That is a later design change, not v1.

---

## 8. Sounds

**Choice: Web Audio API** (simple generated tones). No sound files and no audio library. One “success” sound and one “error” sound.

---

## 9. Security (v1, honest baseline)

- All AI calls from the Node server only.
- Admin routes require the simple login.
- Do not log API keys or raw passwords.
- HTTPS is expected when deployed; local HTTP is fine in development.
- This is not a multi-tenant hardened system. Simple auth will be replaced later.

---

## 10. UI/server stack (confirmed)

Already chosen in `readme.md`: TypeScript, Node, Tailwind, PWA.

Also confirmed for v1 (kept small on purpose):

- **Vite + React** for the UI (player + admin). Quiz state and admin forms are painful in raw DOM.
- **Hono** (MIT) for the HTTP API on Node. Small, and easier to move to Netlify functions later than Express.
- PWA installability via a Vite PWA plugin **only when we need it**; a mobile-friendly web app is enough for the first playable slice.

No i18n library. No database library. No extra AI gateway.

---

## 11. Explicitly out of scope for iteration 1

These are known future ideas, not part of the first build:

- User accounts / login
- Replaying or storing old quizzes
- Training mode (repeat with an algorithm)
- Multiple domains in one round
- Ads
- Offline quiz
- Database
- Selling or redistributing the software itself (see license in `readme.md`)
- LiteLLM / extra AI gateway
- Strong admin identity (OAuth, SSO, hashed user store)

---

## 12. Closed decisions (was: open questions)

1. Scoring: confirmed as in section 4.
2. Libraries: React, Vite, Hono, Vercel AI SDK, Zod — accepted despite a preference for few dependencies.
3. Default AI: DeepSeek (`https://api.deepseek.com`, model `deepseek-v4-flash`).
4. Quiz language: Swedish. UI chrome: English in v1.
5. After a correct answer: **Next** button (no auto-advance).
6. Bad AI JSON / failed call: **one retry, then fail** and stay on the start screen.

Note: after iteration 1 shipped, **player UI chrome is Swedish** and **admin stays English**. The catalog is **category + topic (subject)**, not a flat domain list. Question count on Start is 5–50 in steps of 5.

---

# Iteration 2 — three roles, platform vs private catalog, database later

## 13. What iteration 2 is

The product splits **who may play**, **who may create**, and **who may edit everything**.

| Actor | Play platform content | Own private categories / questions | Generate with AI | Persist |
|---|---|---|---|---|
| Guest | Yes, from the platform bank | No | No | Browser session only |
| Logged-in player | Yes | Yes, only theirs | Yes, into **their** catalog | Browser cache **and** later database |
| Admin | Stocks the platform bank | Sees and edits **all** private trees too | Yes, into the **platform** bank | Catalog + questions + users |

Guest Start must not call the AI. That keeps public play cheap when the user count is large.

**Next focus: the three UIs**, not the hosting move. File-based JSON is enough while we design guest / logged-in / admin screens. A real database comes when the UI is stable, or when we deploy.

## 14. Names and scale

| Code (`Topic`) | Product | Player |
|---|---|---|
| Category | Folder of subjects | Kategori (e.g. Vetenskap) |
| Topic | One playable subject | Ämne (e.g. Människokroppen) |

Planned size (order of magnitude, not a cap):

- Hundreds of **categories**
- Hundreds of **subjects** per category is allowed (the catalog can be large)
- Platform questions: **per subject and per difficulty** (hard / medium / easy / children)
- A subject may hold **100+** questions per difficulty. **Do not** hard-limit the bank at 50. A *round* still asks for 5–50 questions (UI step 5).

Question rows at the high end can reach millions. That is why production needs SQL. A few subjects in JSON is fine for UI work.

## 15. The three UIs (build these first)

Keep one PWA. Same play screen. Different start/home and admin.

**Guest**

- Continue without an account.
- Category → subject → count → difficulty → Start. **Only platform** subjects that already have enough bank questions for a round.
- Count and difficulty lists only show values the bank can fill. No “too small” error.
- Start **draws** from the platform bank. No AI, no generate, no add, no edit.

**Logged-in player**

- Guest play of platform content, plus a **private catalog**.
- Private means their own categories, subjects, and questions. Same play flow. Only they (and Admin) see that tree.
- Generate with AI into a **private** subject (not into the platform bank).
- While we are still on files: persist private catalog + questions in JSON with an owner, and/or browser cache. Same schema as below.
- Player login is **file-based for now**: `data/users.json` (`username` + plaintext `password`). Server checks it on `POST /api/player/login` and sets a cookie. Replace with a real user store later. Do not mix these accounts with admin.

**Admin** (English)

- **See and edit all** categories, subjects, and questions (platform and every player’s private tree). Show the owner on each folder (Platform, or the player name).
- **Category first.** List / add / rename / remove. Empty categories are allowed.
- **Edit** on a category or subject opens name (and subject fields). Save, Cancel, and Remove live on that screen. The list only has **Edit** plus **Add** for the children.
- **Four folders:** Categories → subjects → difficulty → question. Click a row to open the next list. Breadcrumb path goes up.
- Click a subject to open difficulties (counts + Generate). Click a difficulty to list those questions, then click a question to edit it (including the correct option).
- **Platform Generate** fills the platform bank per subject + difficulty; skip duplicates (same question text). Removing a category or subject also removes its questions (with a warning).
- **Users** tab: player accounts (list / add / edit / remove). From a user, Admin can open that user’s private catalog. Placeholder until built.
- **Save per change**, not a whole-catalog dump. The JSON file is still rewritten on the server; a later database will do one-row inserts/updates.
- **Nav:** Categories | Users | Settings. Click Categories again to return to the category list. Settings is AI, Log, and later more.
- Leave a logged-in admin session with **Log out** (returns to the player start). No public “Start page” link in admin. Admin is only at `/admin`, not on the player chooser.
- Admin auth stays env username/password. Do not reuse player accounts for admin.

Leave the ad slot in guest and logged-in play. No ad network yet.

## 16. JSON now, database when UI is done

**Choice: no new database library in this UI phase.** Same files as today:

| Data | UI-phase (files) | Later (hosted) |
|---|---|---|
| Categories + topics | `data/domains.json` (add owner fields; missing owner = platform) | `categories`, `topics` |
| Platform + private questions | `data/questions.json` (`owner_type` / `owner_id`) | `questions` |
| Player users | `data/users.json` | `users` |
| Admin + AI secrets | env + git-ignored secrets | same (not in the question DB) |
| Active round | sessionStorage (already) | still the client; no guest writes |

Platform bank file: `data/questions.json`. Guest Start draws a round from **platform** rows only (no AI). If the bank is smaller than the requested count, Start is refused.

**Later host:** Netlify (static PWA + functions) + **hosted Postgres** (Neon or Supabase). One SQL dialect locally and in production. Do not plan SQLite-now / Postgres-later.

**Netlify constraint:** a 50–100 question AI job is a bad fit for a short serverless request. Admin “fill the bank” should become a **background job** at deploy time. Guest play is a short read. Hono can move to Netlify functions; long AI work cannot stay “one HTTP Start”.

## 17. Database schema (target)

Postgres. UUIDs as text or uuid. JSON for the options array is fine (`jsonb`).

```
users
  id              text primary key
  username        text unique not null
  password_hash   text          -- or omit if we use a hosted auth provider
  created_at      timestamptz not null

categories
  id              text primary key
  name            text not null
  owner_type      text not null   -- platform | user
  owner_id        text            -- null when platform; users.id when private

topics
  id              text primary key
  category_id     text not null references categories(id)
  name            text not null
  option_count    int not null default 4
  prompt          text not null
  -- owner is the parent category's owner (do not mix private subjects into a platform category)

questions
  id              text primary key
  topic_id        text not null references topics(id)
  difficulty      text not null   -- hard | medium | easy | children
  question        text not null
  options         jsonb not null  -- string[]
  correct_index   int not null
  explanation     text not null
  source_url      text
  owner_type      text not null   -- platform | user (same as the category)
  owner_id        text            -- null when platform; users.id when private
  created_at      timestamptz not null

  -- Guest/platform play:
  index (topic_id, difficulty, owner_type)
  -- Private catalog:
  index (owner_id, topic_id, difficulty)
  index (owner_type, owner_id) on categories
```

Rules:

- **Owner lives on the category.** Subjects and questions in that folder are the same owner. A player does not add private subjects under a platform category (that would leak into the guest tree).
- Platform: `owner_type = platform`, `owner_id` null. Readable by everyone.
- Private: `owner_type = user`, `owner_id` set. Readable by that user and by Admin. Never sent to guests or other players.
- **No design cap** on how many rows a subject+difficulty may have.
- Guests must not write `questions` (or a seen-table) on every Start. Anti-repeat for guests stays in the browser.
- Logged-in generate **inserts** into that user’s private subject.
- Admin generate **inserts** platform rows. Admin may also edit any private row.
- Category ids must be unique globally. Do **not** rely on slug-from-name alone once two players can both create “Film”. Prefer UUID (or slug + owner suffix) when private catalogs exist.

Out of schema for now (later tables): quiz history, seen-question lists for logged-in users, awards, stats.

Admin is **not** a row in `users` in this design.

## 18. AI in iteration 2

- **Guest:** never.
- **Admin:** fill platform bank, per subject + difficulty. Same OpenAI-compatible stack as v1 (DeepSeek default). May generate in batches; one huge “100 questions” call is optional, not required.
- **Logged-in:** generate into a **private** subject they own. Same stack. Save in their catalog, not the platform bank.

**Source focus (0.2.54).** A subject may store an optional `sourceUrl` and `sourceFocus` (`only` | `mainly`). The generate call then cites that URL instead of forcing Wikipedia. **Read source pages** (`fetchSourceEnabled`, Admin AI settings, off by default) downloads the page and sends truncated text to the model. Extra tokens and time. PDFs and login-walled books are not read. The chat API is unchanged (no Gemini/DeepSeek web-search tool).

Shuffle options before store, as today.

If generate returns questions already in that bank (same subject + difficulty + owner), skip them.

## 19. Iteration 2 order

1. Guest Start reads the **platform bank** (no AI).
2. Logged-in private catalog UI (categories / subjects / questions + generate).
3. Admin: owner on rows, Users tab, ability to open a player’s tree.
4. Real player accounts (ids, hashed passwords).
5. **Postgres + Netlify**. Move the same schema off JSON.

Do not add LiteLLM, an i18n library, or a second AI framework for this.

## 20. Closed decisions (iteration 2)

1. Category = folder; topic/subject = playable Ämne. Large catalog (hundreds × hundreds) is in scope for the database, not for the JSON UI mock.
2. Platform questions are **per difficulty**. No 50-question cap in the bank.
3. Private content is a **full catalog** (categories + subjects + questions), not only extra questions on a platform subject.
4. UI-first; **JSON files until the three UIs are concluded**.
5. Guest = platform only. Logged-in = platform play + private catalog. Admin = all of it, plus users.
6. Player auth and admin auth stay separate.
7. Production database is Postgres, not Netlify Blobs.
8. Owner is on the category; children inherit. No private subjects inside a platform category.

## 21. Review: Admin UI and data model vs this scope

**What already matches**

- Three roles exist (Admin via `/admin`, Logga in, guest). A small Admin shortcut is on the chooser for testing.
- Admin catalog drill-down (categories → subjects → difficulty → question) is the right shape for editing questions, including the correct option.
- Generate per difficulty, counts, skip duplicates, delete-with-warning: fine for the **platform** tree.
- `StoredQuestion` already has `ownerType` / `ownerId`. Categories have optional `ownerType` / `ownerId` (missing = platform).
- Guest Start and logged-in Start (platform **and** private) draw from the bank. Generate is not on Start.
- Logged-in Start shows platform categories and **Mina kategorier** as two matching pickers. **Skapa / redigera** opens the private folder editor (add/rename/remove, generate).
- Guest catalog is platform-only and only stocked subjects. Logged-in play list is stocked platform + that player’s stocked private subjects.
- New catalog rows get UUIDs; existing platform slugs are kept. Add / rename / remove is one API call per row (player, platform admin, or admin-as-user). The JSON file is still rewritten on disk; a later database can use the same calls. Whole-catalog PUT is gone.
- `users.json` has a stable `id` per player (plaintext password still).
- Admin **Users** lists demo players and can open the same folder UI scoped to that player (`Users / Anna / …`). **Categories** stays platform-only.
- Catalog mutations are per-row (`POST`/`PUT`/`DELETE` categories and topics). `GET` still returns the tree for that owner. Whole-catalog save helpers are gone.
- Admin Back is a visible button (catalog drill-down and Settings). Topic edit is labelled **Edit prompt** / **Redigera prompt**. Category and subject lists have Edit (opens the row) and Remove. Question lists support select / delete selected / delete all (Admin and Mina kategorier).
- Admin buttons: blue = primary, gray = secondary, sky text = open/go, red text = ask to delete, solid red = confirm in a popup (list stays visible).
- Subjects can store a source URL and only/mainly. Admin AI has **Read source pages** (off by default). Without that switch the model is only told the link.

**What does not match yet (do not pretend it works)**

- Player Mina kategorier has generate, folder edit, and question list delete (not a per-question editor; Admin Users has edit).
- No add/edit/remove of player accounts yet (list + open catalog only).
- Source fetch is HTML/text only. No PDF, no Gemini/DeepSeek “search the web” tool.

**Suggested next code changes**

1. Per-question edit/remove in Mina kategorier.
2. Hashed passwords when accounts become real.
