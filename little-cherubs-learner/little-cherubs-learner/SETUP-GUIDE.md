# Little Cherubs Learner: setup guide

This guide takes you from the zip file to a live web app on Netlify that sells 90-day passes through Selar. Allow about two hours for the first setup. No coding is needed, but you will copy some settings carefully.

**What you need**
- A free GitHub account (github.com). It stores the app's files.
- A Netlify account (netlify.com). It runs the app.
- Your Selar account, with your pass product created.
- A Zapier account (zapier.com). It passes Selar sales to the app. The "Webhooks by Zapier" step it uses needs a paid Zapier plan.
- About 30 minutes to test with your own purchase.

---

## 1. Put the files on GitHub

1. Sign in to GitHub and create a **new repository**. Name it `little-cherubs-learner` and make it **Private**.
2. On the new repository's page, choose **uploading an existing file**.
3. Unzip `little-cherubs-learner.zip` on your computer. Open the folder, select **everything inside it** and drag it onto the GitHub page.
4. Write "First version" in the message box and choose **Commit changes**.

Check that the repository shows folders such as `public`, `netlify`, `lib` and `config`, and files such as `package.json` and `netlify.toml`.

## 2. Create the site on Netlify

1. Sign in to Netlify. Choose **Add new site**, then **Import an existing project**, then **GitHub**.
2. Allow Netlify to see your `little-cherubs-learner` repository and choose it.
3. Leave the build settings as they are. They come from `netlify.toml`. Choose **Deploy**.
4. After a minute or two you get an address like `https://something.netlify.app`. You can rename it in **Site configuration > Site details > Change site name**, e.g. `littlecherubs.netlify.app`, or connect your own domain later.

## 3. Add your settings (environment variables)

In Netlify, open your site, then **Site configuration > Environment variables > Add a variable**. Add each of these:

| Name | What to put | Example |
|---|---|---|
| `ADMIN_PASSWORD` | A long password only you know (10+ characters). Signs you in to the admin area. | `Cherubs-Admin-2026!x` |
| `SELAR_WEBHOOK_KEY` | A long random code (16+ characters). Zapier sends it with every sale so nobody else can fake one. | `k7Qm2Lz9xV4pR8tW1nB6` |
| `SITE_URL` | Your site address, with no slash at the end. | `https://littlecherubs.netlify.app` |
| `RENEW_URL` | The Selar link to your pass product. Parents are sent here to buy and renew. | `https://selar.com/xxxxxx` |
| `NOTIFY_WEBHOOK_URL` | Added in step 6. Leave it for now. | |

Then go to **Deploys > Trigger deploy > Deploy site** so the settings take effect. Do this every time you change a setting.

## 4. Sign in to the admin area and add content

1. Open `https://YOUR-SITE/admin/` and sign in with `ADMIN_PASSWORD`.
2. **Overview** shows a setup check. Items still missing are explained there.
3. Open **Content and video** and upload `content/BIO-F1-1.3.1.1.md` (it's in the zip). The check should say "No problems found."
4. Choose **Preview and add video**, then upload:
   - **Data saver**: 240p MP4. Learners get this by default.
   - **Phone**: 360p MP4.
   - **Audio only**: MP3.

   You don't need all three, but upload at least the data saver version.

**Each week:** when a content set is approved in your Claude Project, export the doc as **Markdown (.md)** and upload it here. The Competence ID in the doc decides which topic it fills. Uploading again replaces the old version, and learners keep their progress.

**Making the video versions:** the free program HandBrake can make 240p and 360p MP4 versions and an audio file from your master video. Or send the master video to Claude and ask for the three versions.

## 5. Match your Selar product name

The app recognises a sale by its product name. Open `config/products.mjs` on GitHub and choose the pencil (edit) icon. Check that the `match` text appears in your Selar product's name. The default is `Form 1 Biology`, so a Selar product called "Little Cherubs: Form 1 Biology 90-day pass" matches. Choose **Commit changes**; Netlify redeploys by itself.

Use one product for both first purchases and renewals, or two products that both contain the match text. Either way, every sale adds 90 days.

## 6. Connect Selar to the app with Zapier

### Zap 1: new sale → app → welcome email

1. **Trigger:** app **Selar**, event **New Sale**. Connect your Selar account and test it with a recent sale.
2. **Action:** app **Webhooks by Zapier**, event **POST**.
   - URL: `https://YOUR-SITE/api/webhooks/selar`
   - Payload type: `json`
   - Data, one row each, mapping the Selar fields on the right:
     - `email` → buyer's email
     - `phone` → buyer's phone
     - `name` → buyer's name
     - `product` → product name
     - `reference` → order or transaction reference
     - `amount` → amount paid
     - `currency` → currency
   - Headers: `x-webhook-key` → the same code as `SELAR_WEBHOOK_KEY`
   - Test it. The response should show `"ok": true`, plus a `setupUrl` for a new parent.
3. **Action:** **Filter by Zapier**, only continue if `newFamily` is true.
4. **Action:** **Gmail** (or **Email by Zapier**), sent to the buyer's email.
   - Subject: "Set up your Little Cherubs Learner account"
   - Body: thank the parent and include the `setupUrl` from step 2.

   Returning parents don't need an email: their 90 days are added automatically.

### Zap 2: reminders and password resets

1. **Trigger:** **Webhooks by Zapier**, event **Catch Hook**. Copy the web address Zapier gives you.
2. In Netlify, add the variable `NOTIFY_WEBHOOK_URL` with that address, then trigger a deploy.
3. **Action:** **Gmail** to `email`.
   - Subject: "Little Cherubs Learner"
   - Body: `message` for reminders, or `link` for password resets. The `type` field says which: `pass_ending`, `pass_ended` or `password_reset`.
4. *Optional:* add a WhatsApp or SMS step if you have a WhatsApp Business sending tool connected to Zapier. Send `message` (or `link`) to `phone`.

The app sends reminders at 08:00 Zambian time: 10 days before a pass ends, 2 days before, and on the day it ends.

### Test with your own purchase

Buy your pass on Selar with an email you can check. Within a few minutes:
- the sale appears in **Admin > Sales log**;
- you receive the set-up email.

Open the link, create the account, and choose your child's profile. Check the lesson, the video and the practice questions, then the parent area (with your PIN).

## 7. Everyday tasks in the admin area

| Situation | What to do |
|---|---|
| A parent paid you directly (e.g. Airtel Money) | **Record a sale**. A new parent gets a set-up link to send; an existing parent gets 90 days added. |
| A Selar sale didn't come through | Check **Sales log**. If it's missing, use **Record a sale** with the Selar order reference. |
| A parent forgot their password | **Families**, open the family, then **Make password reset link**. Send the link by WhatsApp. It works once, for 24 hours. |
| A parent lost the set-up email | Open the family, then **Make new set-up link**. |
| "Already used on 2 devices" | The parent can remove a device in **Parent > Pass**, or you can choose **Clear all devices** for that child. |
| Give extra days, or correct a mistake | Open the family, enter the days (use a minus number to remove), add a reason, then **Apply**. |
| Two children in the same Form | A new pass waits in the parent's account until they choose which child gets it. You can also apply it from the family page. |

## 8. How access is protected

- **Online only.** Lessons, questions and video come from the server each time, after the pass is checked. Nothing is saved on the phone.
- **Answers stay on the server.** Correct answers and marking points are sent only after the learner has answered.
- **Video is never a public link.** It plays only for a signed-in learner with an active pass, and the learner's name moves across the picture to discourage screen recording. No website can fully stop someone filming a screen with another phone.
- **Two devices per child, one at a time.** Using the same child's profile on a second device signs out the first.
- **A parent PIN** keeps the parent area private from the child.
- **Passwords and PINs are stored scrambled (hashed)**, never as plain text.

## 9. Costs and growing

- **Netlify:** Netlify includes the storage the app uses (Netlify Blobs) and daily scheduled jobs. Check your Netlify plan's limits for function calls and bandwidth, because every video streamed counts towards them. At launch with a few hundred learners, this should be modest.
- **When you have many learners:** move videos to a dedicated streaming service such as Bunny Stream or Mux. Only one file changes (`lib/media.mjs`), which is a short job for a developer.
- **More subjects:** add each subject's curriculum file next to `config/curriculum-biology.mjs`, and a product line in `config/products.mjs`. This is a developer job: the subject switch on the learner side needs adding.

## 10. Known limits of this first version

- In structured questions, learners write their answers in one box rather than filling in the table on screen.
- Messages to parents (set-up, reminders, resets) go through Zapier. Without Zap 2, you send reset links yourself from the admin area.
- The admin area has one shared password. If someone else helps you, they use the same password.
- Biology is the only subject wired in.
