# Admin setup

The full, current guide is **[docs/OPERATIONS.md](docs/OPERATIONS.md)**: environments and variables, Supabase setup (sign-ups off, email templates, MFA), creating the first owner by invitation, deploying, the go-live test order, demo-data removal, roles and security.

Quick version:
1. Create a **production** and a separate **staging** Supabase project; run `0001_init.sql` then `0002_security.sql` in each.
2. Set the environment variables (see `.env.example`) in Railway (the `production` environment → production Supabase project, a `staging` environment → staging project). See docs/OPERATIONS.md section 5.
3. `npm run create-owner -- --email you@example.com` emails you a link to choose your own password.
4. Sign in at `/admin/login`, turn on two-factor in **My account**, then do the first-run steps in section 5 of the guide.

There is no demo mode, no preview login and no shared password anywhere in the application.
