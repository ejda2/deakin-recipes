# Deakin Family Recipes

A shared family cookbook. Anyone in the family signs in with Google to browse, search, add recipes, comment, star favorites, print a recipe, or save a PDF cookbook.

Built the same way as the F1 Challenge: a React app (Vite) on GitHub, deployed by Vercel, with Firebase holding the data. Firebase also handles the Google sign-in.

Until Firebase is connected, the site runs in **preview mode** with the 61 workbook recipes loaded in memory. You can click around, but nothing is saved.

---

## Step 1: Upload the files to GitHub

1. Unzip `deakin-recipes.zip` on your desktop.
2. Open https://github.com/ejda2/deakin-recipes and click **uploading an existing file**.
3. Open the unzipped `deakin-recipes` folder, select everything inside it (including the `public` and `src` folders), and drag it onto the GitHub page.
4. Click **Commit changes**.

## Step 2: Deploy on Vercel

1. Go to https://vercel.com/new and import `ejda2/deakin-recipes`.
2. Vercel detects Vite automatically. Click **Deploy**.
3. Write down the site address it gives you (for example `deakin-recipes.vercel.app`). The site opens in preview mode for now.

## Step 3: Create the Firebase project

1. Go to https://console.firebase.google.com and click **Create a project**. Name it `deakin-recipes`. Turn off Google Analytics. Create.
2. On the project home page, click the **</>** (Web) icon. Nickname it `recipes-web` and click **Register app**. Leave Firebase Hosting unchecked.
3. Firebase shows a `firebaseConfig` block. Copy it. You'll paste it in Step 6.

## Step 4: Turn on Google sign-in

1. In the left menu: **Build > Authentication > Get started**.
2. Under **Sign-in method**, click **Google**, switch it on, pick your email as the support email, and **Save**.
3. Go to the **Settings** tab > **Authorized domains** > **Add domain**, and add your Vercel address from Step 2 (just the domain, like `deakin-recipes.vercel.app`).

## Step 5: Create the database and paste the rules

1. **Build > Firestore Database > Create database**. Choose **Production mode** and a US region (for example `us-east5`, the same as the F1 app).
2. Open the **Rules** tab, delete what's there, paste in the whole contents of `firestore.rules`, and click **Publish**.

## Step 6: Connect the app to Firebase

1. On GitHub, open `src/firebase.js` and click the pencil icon to edit.
2. Replace the six `PASTE_...` values with the ones from your `firebaseConfig`.
3. Click **Commit changes**. Vercel redeploys on its own in about a minute.

## Step 7: Import the 61 recipes

1. Open the site and sign in with **ejdeakin@gmail.com** (the admin account).
2. Click your picture (top right) > **Admin** > **Import 61 recipes**.

The import only adds recipes that aren't there yet, so running it twice does no harm.

## Step 8: Invite the family

Send them the Vercel link. They sign in with any Google account.

When a family member who contributed recipes to the workbook signs in (for example Rich), go to **Admin**, type `Rich` next to his account, and click **Save**. He can then edit the recipes listed under "Rich." Recipes people add themselves are always theirs to edit.

---

## Who can do what

| | Anyone signed in | Recipe's contributor | Admin |
|---|---|---|---|
| Browse, search, print, save PDF | yes | yes | yes |
| Add recipes, comment, favorites | yes | yes | yes |
| Edit or delete a recipe | | yes | yes |
| Delete a comment | their own | their own | any |
| Link people to contributor names | | | yes |

These rules are enforced by Firebase (`firestore.rules`), not just hidden in the app.

## Files

- `src/App.jsx`: the screens
- `src/store.js`: reading and writing data (Firebase, or the in-memory preview)
- `src/pdf.js`: PDF cookbook and single-recipe PDFs
- `src/text.js`: how ingredients and directions text is laid out; the category list
- `src/seedRecipes.json`: the 61 recipes from the workbook
- `src/firebase.js`: Firebase settings and the admin email
- `firestore.rules`: database security rules
- `public/fonts`: Zilla Slab, PT Sans, and Caveat (all SIL Open Font License)

To change the admin, edit `ADMIN_EMAIL` in `src/firebase.js` **and** the email in `firestore.rules`, then republish the rules.

To add a category, add it to `CATEGORIES` in `src/text.js`.
