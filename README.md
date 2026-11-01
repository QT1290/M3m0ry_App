# PAO Memory

A small web app for learning and training a 00–99 PAO (Person, Action, Object) system. It runs fully in the browser, works offline, and can be installed on a phone's home screen.

## Features (so far)

- **PAO list**: all numbers 00–99 with progress, search, and an "incomplete only" filter.
- **Editor**: edit Person, Action and Object per number. Changes save automatically. Enter jumps to the next field, then to the next number.
- **Train**: flashcards (number → P/A/O, grade yourself), reverse (P/A/O → type the number), multiple choice, a 60-second speed drill with personal best, or a mix. Ask about Person, Action, Object or all of them. Spaced repetition puts missed numbers in front and spaces out the ones you know. A missed card comes back once later in the same session. The hub shows due/new/mastered counts and the numbers that need work.
- **Recall test**: memorize a random string of digits (12 to 100, or any length) with or without a time limit, then type it back. Shows all digits at once or one PAO image (6 digits) at a time, with an optional practice mode that shows the PAO under each group. Results show which digits were wrong and are saved to a history with your longest perfect run.
- **Backup**: download your list as a `.json` backup or `.csv` spreadsheet, restore a backup, or import a CSV with columns `number, person, action, object` (comma, semicolon or tab separated).

Your data is stored only in the browser on your device (localStorage). Download a backup now and then.

## Put it on your phone (GitHub Pages)

1. On GitHub, open the repo's **Settings → Pages**.
2. Under "Build and deployment", choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
3. After a minute the app is live at `https://<your-username>.github.io/M3m0ry_App/`.
4. Open that link on your phone:
   - **iPhone (Safari)**: Share → *Add to Home Screen*.
   - **Android (Chrome)**: menu ⋮ → *Install app* / *Add to Home screen*.

## Run it on your computer

No build step is needed. From the repo folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly as a file does not work, because the app uses JavaScript modules and a service worker.)

## Development notes

- Plain HTML, CSS and JavaScript modules, with no dependencies.
- `js/store.js` holds all data access; `js/app.js` holds the views and hash-based routing.
- `sw.js` caches the app for offline use. Bump `CACHE` in `sw.js` when you change files so installed copies update.
