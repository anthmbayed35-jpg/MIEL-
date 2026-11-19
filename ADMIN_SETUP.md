# Admin setup

The full, current guide is **[docs/OPERATIONS.md](docs/OPERATIONS.md)**: variables, the exact Railway steps (volume at `/data`), creating the first owner, backups and restore, email (Brevo, SPF/DKIM), go-live test and what to do when something fails.

Quick version:
1. Railway: new service from this repo, **one replica**, a **volume mounted at `/data`**.
2. Set the variables from `.env.example` (all of them before the first build), including `DATABASE_PATH=/data/miel.db`.
3. Deploy. On the Railway shell: `npm run create-owner -- --email you@example.com` emails you a link to choose your own password.
4. Sign in at `/admin/login`, turn on two-factor in **My account**, then set stock under **Inventory**.

There is no demo mode, no preview login and no shared password anywhere in the application.
