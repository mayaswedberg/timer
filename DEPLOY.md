# Putting the Interval Timer online for free

The timer is a **static website**: just `index.html`, `style.css` and `app.js`. There is no server code and no build step, so any static hosting service can serve it. This guide uses **GitHub Pages**, which is free. Two alternatives are listed at the end.

When you're done, the site will be at an address like:

```
https://<your-github-username>.github.io/interval-timer/
```

---

## What you need

- A free GitHub account. Sign up at <https://github.com/signup>.
- The three files from this folder: `index.html`, `style.css`, `app.js`.
  (`DEPLOY.md` is optional. Uploading it does no harm.)

> **Important:** `index.html` must sit at the top level of the repository, not inside a subfolder. GitHub Pages looks for `index.html` there.

---

## Option A: Upload through the GitHub website (no command line)

This is the easiest route if you haven't used git before.

### 1. Create a repository

1. Go to <https://github.com/new>.
2. **Repository name:** `interval-timer`. Any name works, and it becomes part of the URL.
3. Set visibility to **Public**. Free GitHub accounts can only publish Pages from public repositories.
4. Leave "Add a README" **unchecked**.
5. Click **Create repository**.

### 2. Upload the files

1. On the new, empty repository page, click the **"uploading an existing file"** link.
2. Drag `index.html`, `style.css` and `app.js` into the upload area.
3. Scroll down and click **Commit changes**.

### 3. Turn on GitHub Pages

1. In the repository, open **Settings** (top tab) and then **Pages** (left sidebar).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Under **Branch**, select `main` and folder `/ (root)`, then click **Save**.
4. Wait 1–2 minutes and refresh the page. A box appears saying
   **"Your site is live at https://&lt;username&gt;.github.io/interval-timer/"**.

Open that link. The timer should work there, on your phone as well as your computer.

### Updating the site later

Open the repository and click **Add file → Upload files**. Upload the changed file(s) and commit. GitHub replaces the old versions, and the live site updates within a minute or two.

---

## Option B: Use git from the terminal

Use this route if you're comfortable with the command line and plan to keep changing the app.

### 1. Create the repository on GitHub

Follow step 1 of Option A: a public repository named `interval-timer` with no README.

### 2. Push the files

Run these commands from this project folder:

```bash
git init
git add index.html style.css app.js DEPLOY.md
git commit -m "Interval timer"
git branch -M main
git remote add origin https://github.com/<your-github-username>/interval-timer.git
git push -u origin main
```

GitHub no longer accepts your account password when you push. Sign in one of these ways:

- **GitHub CLI (simplest):** install it with `brew install gh`, run `gh auth login`, and follow the prompts. After that, `git push` works.
- **Personal access token:** create one under GitHub → Settings → Developer settings → Personal access tokens. Paste it when git asks for a password.

### 3. Turn on GitHub Pages

Follow step 3 of Option A.

### Updating the site later

```bash
git add -A
git commit -m "Describe your change"
git push
```

The live site updates a minute or two after each push.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| The URL shows **404** | Wait a few minutes after turning Pages on. Check that `index.html` is at the top level of the repo and that the file name is all lowercase. |
| The page loads but has no styling, or the buttons do nothing | Check that `style.css` and `app.js` were uploaded next to `index.html`, with exactly those names. |
| The Pages settings ask you to upgrade | The repository is private. Change it to public under **Settings → General → Danger Zone → Change visibility**. |
| Changes don't show up | Wait a minute, then do a hard refresh: <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on Mac, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on Windows. |
| No sound on a phone | Turn off the phone's silent switch or mode. Browsers only allow sound after you tap a button, which is why the sound starts when you press **Start**. |

GitHub Pages serves sites over **HTTPS**. The "keep screen awake" feature only works over HTTPS, so it works on the published site even if it didn't when you opened the file locally.

---

## Alternatives to GitHub Pages

Both of these are free for a small site like this one:

- **Netlify Drop:** go to <https://app.netlify.com/drop> and drag the project folder onto the page. You get a URL right away. Create a free account to keep the site permanently and to choose a nicer name.
- **Cloudflare Pages:** at <https://pages.cloudflare.com>, connect your GitHub repository or upload the folder directly. It's useful if you later want a custom domain.

## Optional: a custom domain

If you own a domain (e.g. `mytimer.com`), open GitHub's **Settings → Pages → Custom domain** and follow the DNS instructions GitHub shows. You don't need one: the free `github.io` address works fine.
