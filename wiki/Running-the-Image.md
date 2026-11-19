# Running the image

The app ships as one hardened container image: Node on distroless (no shell), read-only root file system, non-root
user (uid **65532**), port **3000**, its own health check. The catalog is built into the image, so it needs nothing at
run time except its settings and a place for the database.

## 1. Get the image

The image is a **private** package on GitHub's registry. Log in once on each host, with a personal access token that
has only the `read:packages` scope:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-user> --password-stdin
```

Pull by tag, or better by digest (the release notes print the digest):

```bash
docker pull ghcr.io/futurekill/sr2e-chargen:v0.1.0-beta.1
```

Optional, recommended: check the signature before you run it (needs [cosign](https://docs.sigstore.dev/)):

```bash
cosign verify ghcr.io/futurekill/sr2e-chargen@sha256:<digest> \
  --certificate-identity https://github.com/futurekill/sr2e-chargen/.github/workflows/release.yml@refs/tags/v0.1.0-beta.1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## 2. Settings

Environment variables only. `BASE_URL` is the one you must set.

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | required | The address people type, exactly (scheme, host, port). It must be **https**; plain `http` is accepted only for `localhost`. It is the only Origin the app accepts, so a mismatch makes every form fail. |
| `DATABASE_URL` | `sqlite:///data/chargen.db` | Where the data lives. See [Databases](Databases). |
| `TRUST_PROXY` | none | Comma-separated addresses or CIDRs of your reverse proxy. Only their `X-Forwarded-*` headers are believed (client IPs for rate limits and logs). |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Where it listens inside the container. |
| `LOG_LEVEL` | `info` | `warn` is quieter. Logs go to stdout as JSON. |
| `BACKUP_DIR` | unset | SQLite only: turns on the nightly verified backup into this directory. See [Backups and restore](Backups-and-Restore). |
| `BACKUP_KEEP` | `7` | How many nightly backups to keep. |

## 3. Compose

`docker/compose.example.yml` in the repository is the reference. The short form:

```yaml
services:
  chargen:
    image: ghcr.io/futurekill/sr2e-chargen:v0.1.0-beta.1   # or @sha256:<digest>
    restart: unless-stopped
    environment:
      BASE_URL: https://chargen.example.net
      TRUST_PROXY: 172.16.0.0/12
      BACKUP_DIR: /backups
    ports:
      - "127.0.0.1:3000:3000"      # only the proxy reaches it
    volumes:
      - chargen-data:/data          # the SQLite database (characters and portraits)
      - chargen-backups:/backups    # nightly backups: a separate volume, ideally another disk
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    tmpfs: ["/tmp"]
    mem_limit: 1g                   # the memory bound for PDF rendering and portrait decoding: keep it
volumes:
  chargen-data:
  chargen-backups:
```

```bash
docker compose up -d
```

**Bind mounts instead of volumes:** the container runs as uid 65532, so give that user the directories first:

```bash
sudo install -d -o 65532 -g 65532 -m 0700 /srv/chargen/data /srv/chargen/backups
```

## 4. The reverse proxy

TLS ends at your proxy; the app speaks plain HTTP on `127.0.0.1:3000`.
- Forward `Host` and `X-Forwarded-For` / `X-Forwarded-Proto`, and list the proxy in `TRUST_PROXY`.
- **Allow request bodies of at least 8 MB** (portrait uploads). nginx's default is 1 MB: `client_max_body_size 8m;`.
- The app sets its own security headers (CSP, HSTS and so on); the proxy doesn't need to add them.

## 5. The first admin, then invites

There is no anonymous mode: every player has an account, and accounts come only from invites.

```bash
docker compose exec chargen /nodejs/bin/node server/cli.mjs admin bootstrap
```

It prints a setup link that works once (only while no enabled admin exists). Open it, pick a handle and a password
(12 characters or more). Then make an invite link for each player, either on the Admin page in the app or:

```bash
docker compose exec chargen /nodejs/bin/node server/cli.mjs admin invite
```

Links are shown once and stored only as hashes; if one is lost, make another. All admin commands:
[Admin commands](Admin-Commands).

## 6. Check it

- `docker compose ps` shows `healthy` (the image's health check calls `/healthz`).
- `curl -fsS http://127.0.0.1:3000/healthz` answers `{"ok":true}`.

## Updating

Pull the new tag (or digest), change `image:`, `docker compose up -d`. Database migrations run at start; an older image
refuses to start against a database a newer one migrated, so read the release notes before going back a version.
With SQLite, take a backup first (`backup create`, see [Backups and restore](Backups-and-Restore)).

## Platform

linux/amd64 only for now (the portrait library ships a prebuilt libvips for that platform).
