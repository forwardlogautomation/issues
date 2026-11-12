# Forwardlog Issue Log

Project issues and action plans, in English and Chinese (中文), for every client project.
Site: https://forwardlogautomation.github.io/issues/

- **Frontend:** `index.html` (static, GitHub Pages). Shared logo, fonts and sign-in come from the main site.
- **Backend:** Google Apps Script bound to the Google Sheet "Forwardlog Issue Log Portal" (`backend/Code.gs`, `backend/Seed.gs`).
- **Access:** the Settings page (control centre), portal key `issues`. Everyone with access can add and edit issues. Only portal admins can delete one.
- **Translation:** when you save, the empty language is filled in by Google Translate (`LanguageApp`, built into Apps Script).
- **Exports:** Excel and PDF are built in the browser. "Save to Google Drive" puts one Excel copy in the
  *Project Issues & Action Plan* Drive folder and replaces the previous copy.

## One-time setup

1. **Sheet and script**
   1. Create a Google Sheet named **Forwardlog Issue Log Portal**, then open Extensions → Apps Script.
   2. Paste `backend/Code.gs` into `Code.gs`.
   3. Add a script file named `Seed` and paste `backend/Seed.gs` into it.
2. **Script properties** (Project Settings → Script properties)
   - `CLIENT_ID`: the same Google client ID as the other portals, `91172054296-efavj9to958vrqkdk67pa96fo82466gk.apps.googleusercontent.com`.
3. **Run `setup`** once from the editor and approve the permissions it asks for.
   It creates the **Issues** and **Log** tabs and copies the 37 issues from the old Claude tracker.
   You can run it again safely, because it only adds issues that are missing.
4. **Deploy:** Deploy → New deployment → Web app.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Copy the `/exec` URL. Also store it as the script property `API_URL`.
5. **Connect the page:** put the `/exec` URL into `API_URL` in `index.html` (search for `PASTE_EXEC_URL_HERE`).
6. **Register in the control centre** (Forwardlog Admin Portal sheet):
   - **Access tab:** add a column `issues` before `extraPw`.
   - **Links tab:** add rows for the site, code and backend.
   - **Health tab:** add a row with `issues` and the `/exec` URL.

After any change to `Code.gs`, go to Manage deployments → Edit → **New version**. The `/exec` URL stays the same.

## Rebuilding index.html

`src/build.py` builds `index.html` from the main site's shared parts (FL-LOADER v2, header, sign-in) plus
`src/page.css` and `src/page.js`. It expects both repos checked out side by side under `/home/user`:

```
python3 src/build.py https://script.google.com/macros/s/<deployment id>/exec
```
