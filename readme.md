# THIS IS WORK IN PROGRESS
# TiddeliQuiz

A quiz PWA (browser and phone). Questions are Swedish. The player UI is Swedish. Admin chrome is English.

There are three kinds of people using the app. Storage can stay as JSON files until the UIs are settled.

## Names

| Code | Player (sv) | Example |
|---|---|---|
| Category | Kategori | Vetenskap |
| Topic (also called **subject**) | Ämne | Människokroppen |

A **category** groups many subjects. The catalog can grow to **hundreds of categories**, each with **hundreds of subjects**.

A **round** is one subject, one difficulty, and a question count (5–50, default 10).

## Who does what

| | Guest (not logged in) | Logged-in player | Admin |
|---|---|---|---|
| Play admin (platform) questions | Yes | Yes | Stocks them |
| Create categories / subjects / questions | No | Yes, **private** (only they play them) | Yes, **platform** (everyone plays them) |
| Edit someone else’s content | No | No | Yes, **all** of it (platform and every user’s private tree) |
| Manage player accounts | No | No | Yes |

Admin login is separate from player login (env user/password for now).

## Start page

The first screen asks how to continue:

- **Logga in** — player account from `data/users.json` (plain passwords, temporary).
- **Fortsätt utan att logga in** — guest.

Admin is at `/admin` (env username/password). It is not on this screen.

Demo player accounts: `demo` / `demo` and `anna` / `anna`. Replace this file later with a real user store.

## The three UIs

### 1. Guest (not logged in)

- See and play **only platform** content: categories, subjects, and questions created by Admin.
- Choose category, subject, count, difficulty, then play.
- Cannot generate, add, or edit anything.
- The current session may remember the round in the browser. Nothing is stored as “this person’s questions”.

### 2. Logged-in player

Everything the guest has (play platform content), plus:

- A **private catalog**: their own categories, subjects, and questions. Only that player (and Admin) can see them.
- **Generate** with AI into their private subjects (same flow as today’s Start, but saved as theirs).
- Later extras (stats, saved quizzes, awards) belong here, not in the guest UI.

They cannot edit platform content. They cannot see another player’s private catalog.

### 3. Admin (`/admin`)

- See and edit **all** categories, subjects, and questions: platform and every player’s private tree.
- Stock the **platform** bank with AI (per subject and difficulty) so guests and players can play it.
- A subject can hold **many** questions (100+ per difficulty is fine). A *round* is still 5–50.
- Manage **users** (list, add, edit, remove; later open that user’s catalog).
- AI backend: URL, key, model, timeout, temperature, thinking.
- Debug log.

## Play (same once a round has started)

1. Start a round from content that role may see (guest: platform bank; logged-in: platform or their private subject).
2. One question at a time. **Visa alternativ**, then pick.
3. Correct: sound, short explanation, optional Wikipedia-style link, **Nästa**.
4. Wrong: error sound, that option is struck, try again.
5. **Hoppa över** is always available.
6. Summary: rätt / fel / hoppade över. Then **Försök igen (alla)**, **Försök igen (fel)**, **Avsluta**.

Leave space in the player layout for ads later. Do not implement ads yet.

## Questions: who owns what

| Source | Who creates them | Who can play them | Who can edit them |
|---|---|---|---|
| Platform catalog + bank | Admin | Everyone | Admin |
| Private catalog + bank | That logged-in player | That player | That player, and Admin |

Ownership sits on the **category** (the folder). Subjects and questions in that folder belong to the same owner. Platform rows have no player owner.

## Tech stack

- TypeScript, Node, React, Vite, Tailwind, Hono
- AI: OpenAI-compatible HTTP (default DeepSeek). Key stays on the server.
- **Now (UI phase):** JSON files on disk, as today. No new database library until the three UIs are in good shape.
- **Later:** hosted Postgres (e.g. Neon or Supabase) and Netlify. JSON will not survive serverless deploy.

## Limitations, and potential future release todos

- Player question editor (list/edit/remove in Mina kategorier)
- Add/edit/remove player accounts in Admin Users
- Player accounts with hashed passwords
- Persist private catalog in JSON, then database
- Training mode, stats, awards
- Ads
- Offline play
- Strong admin identity

## Security

- AI key and admin password never go to the browser.
- Guest traffic should stay mostly read-only once the platform bank exists (scale).
- A player must never receive another player’s private categories or questions.

## Third-party software

See `design.md` (Vercel AI SDK, Zod, Hono, React). Licenses allow commercial use of the app we build. Do not add libraries without checking.

## License

This software is free to use. You may use it for trading and keep any profits you make. You may copy and modify it for your own use. You may however not sell, redistribute, or commercially license the software itself without the authors approval. The authors and contributors disclaim all liability for any loss, damage, or consequence arising from the use of this software. Use at your own risk.
