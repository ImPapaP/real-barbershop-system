# REAL Barbers: website, online booking and shop dashboard

Replaces Setmore with your own booking system on Firebase.

- **Website** (`/`): menu and prices, team, hours, map, booking policy, and a 4-step booking flow with live availability.
- **Online booking**: the customer picks services, a barber, a date and a free time, then pays the ₱200 deposit through PayMongo (GCash, Maya, card, QR Ph). The slot is held for 15 minutes while they pay. Once paid, the booking is confirmed by email and text.
- **Booking page** (`/booking.html`): the link in the customer's email. They can check the booking, reschedule up to 48 hours before, or cancel.
- **Reminders**: an email and a text the day before, and a text 2 hours before.
- **Dashboard** (`/admin/`): schedule and walk-in queue, checkout (with the online deposit credited), income and expenses with profit, barber commissions and payouts, clients with loyalty, inventory, and shop setup.

## Live preview

Live at **https://impapap.github.io/real-barbershop-system/**. Every push to `main` that changes `public/` copies it to the `gh-pages` branch, which GitHub Pages serves (see `.github/workflows/pages.yml`).

Until `public/assets/firebase-config.js` is filled in, the site runs in **demo mode**. It uses sample data saved only in the visitor's browser, skips payments, emails and texts, and opens the dashboard without a real sign-in. Use **Reset demo** in the top bar to start over. It's meant for showing the owner how everything works before Firebase is set up.

Once Firebase is connected, the real site lives on Firebase Hosting (step 4). If you keep the GitHub Pages copy too, add its domain under Firebase console → Authentication → Settings → Authorized domains.

No two customers can book the same chair at the same time. Every booking claims its hourly slots inside a database transaction, and bookings you add by phone in the dashboard block those slots too (one at 10:30 blocks both the 10:00 and 11:00 hours if it runs past 11).

---

## What it costs to run

| Service | What it does | Cost |
|---|---|---|
| Firebase (Blaze plan) | Website hosting, database, sign-in, booking functions | Pay-as-you-go with a free monthly allowance. A shop this size normally stays inside it. A card on file is required. |
| PayMongo | Takes the ₱200 deposit | A fee per payment that depends on the method. It's deducted from your payout. |
| Semaphore | Sends the texts | ₱0.56 per text (ex. VAT) at the time of writing. About 3 texts per booking. |
| Gmail | Sends the emails | Free. Uses the shop's Gmail. |

Set a budget alert in Google Cloud (Billing → Budgets) so you're told if costs ever pass a limit you pick.

---

## Setup

Setup comes in two parts. **Part 1 costs nothing and needs no card.** It puts the website online, with the real menu and the full dashboard (schedule, walk-ins, checkout, income and expenses, barbers, clients, inventory). Customers book by calling or messaging the shop.

**Part 2 is everything that involves payment:** Firebase's Blaze plan (needs a card), PayMongo and Semaphore credits. It adds online booking with the ₱200 deposit, texts and emails, and photo uploads.

You need a computer with **Node.js 22** installed.

### Part 1: free setup (about an hour)

#### 1. Create the Firebase project (Spark plan, free)

1. Go to https://console.firebase.google.com and create a project (for example `realbarbers`). Stay on the free **Spark** plan.
2. **Firestore Database** → Create database → location **asia-southeast1 (Singapore)** → production mode. The location can't be changed later.
3. **Authentication** → Get started → enable **Email/Password**.
4. Install the Firebase tools and sign in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
5. Clone this repo and put your project ID in `.firebaserc` (replace `your-firebase-project-id`).

#### 2. Connect the website to Firebase

Firebase console → Project settings → Your apps → **Add app → Web**. Copy the `firebaseConfig` values into `public/assets/firebase-config.js`.

Until this is done, every page runs in demo mode (see Live preview above).

#### 3. Make yourself an admin

1. Firebase console → Authentication → **Add user**: your email and a password.
2. Copy that user's **User UID**.
3. Firestore → Start collection `admins` → Document ID = that UID → add any field, for example `role: "owner"`.

Repeat for each staff member who should use the dashboard. Remove their `admins` document to take access away.

#### 4. Deploy the free parts

```bash
firebase deploy --only hosting,firestore
```

This uploads the website and the database security rules. The site is now at `https://<your-project-id>.web.app`.

#### 5. Load the menu and team

Open `https://<your-project-id>.web.app/admin/`, sign in, and click **Load starter menu**. It saves REAL Barbers' Setmore services and prices and a starter team (Deluxe: Lyndon, Roderick, Reymart, Angelo; Regular: Joe Ed, Renz, Jay, Vince, Mac; Dave for women’s services), the real Setmore reviews, and the GCash number for down payments. Then:

- **Barbers**: fix names, days in, commission rates, and who takes men's or women's bookings.
- **Shop setup**: check the address, hours, prices and durations. Setmore listed every service as 1 hour; the starter menu uses realistic times instead (haircuts at least 45 min: Regular and Signature 45 min, Deluxe 1 hr, promos 1 hr 15 min to 2 hrs, rebond 4 hrs and so on). Adjust any that don’t match your shop. The length decides how long the chair is blocked online.

Online bookings start **on the hour** (9:00, 10:00 … ) and no later than **7:00 PM** (change it in Shop setup → Online booking rules → Last booking starts at), and a service must also finish by closing time.

**Online booking starts switched off.** The website's booking section asks customers to call or message the shop until you turn it on in Part 2. You can start using the dashboard for walk-ins, phone bookings, checkout and expenses right away.

### Part 2: payment setup

#### 6. Upgrade to Blaze and set a budget alert

1. Firebase console → **Upgrade** (bottom-left) → **Blaze**. It needs a card, but a shop this size normally stays inside the free monthly allowance.
2. Set a budget alert (for example ₱300 a month) in Google Cloud → Billing → **Budgets & alerts**. Alerts warn you; they don't stop spending.
3. **Storage** → Get started → choose **us-central1**. Photo storage is only free in US locations. Website photos (homepage, gallery, team) are kept here.
4. Deploy the photo rules: `firebase deploy --only storage`. You can now upload photos in Dashboard → **Website**.

#### 7. Open the payment and texting accounts

- **PayMongo** (https://dashboard.paymongo.com): sign up and complete business verification. The owner needs the DTI or SEC registration, a valid ID and the payout bank account. Approval can take several days. Test keys (`sk_test_...`) work right away. Turn on GCash, Maya, cards and QR Ph under Settings → Payment Methods.
- **Semaphore** (https://semaphore.co): sign up, buy credits, and apply for a sender name such as `R3ALBARBERS`. Copy your API key.
- **Gmail app password**: in the shop's Google account, turn on 2-Step Verification, then create an app password at https://myaccount.google.com/apppasswords. (Free, but only useful once the backend is deployed.)

#### 8. Deploy the booking backend

```bash
cd functions
cp .env.example .env        # then edit .env: SITE_URL, SHOP_EMAIL, SMS_SENDER_NAME, PAYMENT_METHODS
npm install

firebase functions:secrets:set PAYMONGO_SECRET_KEY      # sk_test_... for now
firebase functions:secrets:set SEMAPHORE_API_KEY
firebase functions:secrets:set GMAIL_APP_PASSWORD
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET  # type: none for now, set it in step 9
cd ..
firebase deploy
```

`SITE_URL` is `https://<your-project-id>.web.app` until you connect your own domain. At the end, the deploy prints a **Function URL** for `paymongoWebhook`. Copy it.

#### 9. Tell PayMongo where to send payment notices

Run this once, with your secret key and the Function URL from step 8:

```bash
curl https://api.paymongo.com/v1/webhooks \
  -u sk_test_YOUR_KEY: \
  -H "Content-Type: application/json" \
  -d '{"data":{"attributes":{"url":"https://YOUR-FUNCTION-URL","events":["checkout_session.payment.paid"]}}}'
```

The reply contains `"secret_key": "whsk_..."`. Save it and redeploy the functions:

```bash
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET   # paste whsk_...
firebase deploy --only functions
```

#### 10. Turn on online booking and test it

1. Dashboard → **Shop setup** → Online booking rules → tick **Take online bookings with a deposit** → Save.
2. Book on the website and pay with PayMongo's test flow. Check that:
   - the booking shows as Booked in the dashboard with "₱200" next to it
   - the confirmation email and text arrive
   - the time disappears from the website for that barber
   - checkout shows "Deposit paid online −₱200"

`firebase functions:log` shows what happened if something doesn't arrive.

#### 11. Go live

1. When PayMongo approves the account, set the live key: `firebase functions:secrets:set PAYMONGO_SECRET_KEY` (`sk_live_...`).
2. Repeat step 9 with the live key. Live and test webhooks are separate, so this gives you a new `whsk_` secret. Set it as `PAYMONGO_WEBHOOK_SECRET`.
3. `firebase deploy --only functions`.
4. Optional: Firebase console → Hosting → **Add custom domain**, then update `SITE_URL` in `functions/.env` and deploy again.

#### 12. Switch over from Setmore

1. Add every Setmore booking that's still upcoming in the dashboard (Schedule → + Booking) so those times are blocked online.
2. Turn off new bookings in Setmore. Keep the account open until its last booking has passed.
3. Change the **Book** button on the Facebook page and the website link on the Google Business Profile to the new site.

## How a booking works

1. **Customer books.** `createBooking` checks the request, claims the time slots in a transaction (or answers "that time was just taken"), and opens a PayMongo checkout for the deposit.
2. **Customer pays.** PayMongo calls `paymongoWebhook`. The signature is checked, the booking becomes **Booked**, and the email and text go out. The shop's Gmail also gets a "New booking" alert.
3. **Customer doesn't pay.** After 15 minutes, `expireHolds` releases the slot and closes the checkout.
4. **Payment lands after the slot was taken** (rare: the customer paid after the hold ran out and someone else booked). The booking shows as **Paid, slot taken** in the dashboard. Call the client to rebook, or refund them in the PayMongo dashboard and mark the deposit "Refunded".
5. **Reminders.** `sendReminders` runs every 30 minutes.
6. **At the shop.** Checkout subtracts the deposit from the bill. Mark no-shows in the schedule and the deposit is recorded as kept, so it counts as income.

Texts never contain links, because Philippine networks may block texts with URLs. The booking link goes by email.

## How men book: one haircut, then extras

Men first choose **Deluxe** or **Regular**. Only that level's haircuts are shown next: Deluxe Haircut and the BL1–BL4 promos, or Signature and Regular Haircut. They pick **one**, then any **add-ons** (hair spa, color, beard and so on). Switching level clears the haircut. "Book with" a barber or a menu "Book" button picks the level for them.

- Deluxe haircuts can only be booked with the senior barbers (Lyndon, Roderick, Reymart, Angelo). Regular haircuts can only be booked with Joe Ed, Renz, Jay, Vince and Mac. Add-ons work with either.
- An add-on that's already in the chosen promo (for example Hair Spa with BL2) can't be added twice.
- Change it in the dashboard: **Barbers → Edit → Men’s haircuts they do**, and **Shop setup → Services → Booking type / Haircut level**.
- The booking functions check the same rules, so they can't be skipped.

## Barber pay

Each barber earns a **guaranteed daily pay** for every day they work, plus a **commission** on every service they do (after discounts). Senior (Deluxe) barbers split 50/50 with the shop, junior (Regular) barbers get 60% and the shop 40%. The barber's share is rounded down to the whole peso, so on a ₱399 Deluxe Haircut the barber gets ₱199 and the shop ₱200. Tips go fully to the barber.

- Starting rates: senior barbers ₱700 a day + 50%, junior barbers ₱500 a day + 60%. Dave ₱1,000 a day + 55%; Luz and Liza 60%.
- **Product fee (stylists):** on services that use salon products (color, rebond, keratin, treatments; tick "Uses salon products" on the service), the shop takes ₱50 first if the service is under ₱1,500, or ₱100 from ₱1,500 up, then the rest is split. Services without products are a straight split. Example: a ₱1,200 color by Dave → shop ₱50, then 55% of ₱1,150 = ₱632 for Dave, ₱568 for the shop. Set it per person in **Staff → Edit → Product fee**.
- **Roles:** barber, hair stylist and nail technician take bookings and earn commission. Receptionist and maintenance only get daily pay: they're in Who's in and the pay table, but not on the website, in bookings or at checkout. Dave (women's services) starts at ₱0 a day + 60%. Change any of it in **Staff → Edit**.
- A day counts as worked when the barber rang up a sale that day, or when it's one of their scheduled days and they weren't marked absent. Mark absences, or someone coming in on a day off, in **Schedule → Who's in**.
- Days only count from the barber's start date and from the first sale recorded in the system, so old dates don't build up pay.
- **Barbers** shows days worked, daily pay, commission, tips, total earned, and what's owed since the last payout.
- **Pay vs what each barber brings in** (Barbers tab): his service sales next to what the shop pays him (daily pay + commission), pay as a % of his sales, and how much is left for the shop or how much more the shop pays than he brings in. A barber pays for himself once his services pass his daily pay ÷ the shop’s share each day (₱1,250 for ₱500/day + 60%, ₱1,400 for ₱700/day + 50%). The Excel Summary has the same columns.

## Repeat business

- **Time for a trim**: `sendRebookReminders` runs at 10 AM every day. It texts (and emails, if known) clients whose last visit was 28 days ago and who have nothing booked. Change the number of days, or set it to 0 to turn this off, in Shop setup → Online booking rules. Clients → **Due for a trim** lists who's due and lets you send one now. Tick "Don't send trim reminders" on a client to opt them out.
- **Loyalty card**: the customer's booking page shows their stamps, for example "6 of 10 visits". Visits count when a sale is rung up for that client, matched by mobile number.
- **Waitlist**: when a day is full, customers can join its waitlist for a time of day and, optionally, a barber. When a booking is cancelled, rescheduled or an unpaid hold expires, the first 5 matching people get a text and email. It's first come, first served. The Schedule tab shows the waitlist for each day.

## Files

```
firebase.json             hosting, functions and database config
firestore.rules           who can read and write what
firestore.indexes.json    indexes the booking functions need
functions/
  index.js                booking functions (create, webhook, expire, reminders, reschedule, cancel, slot sync)
  src/core.js             booking rules, slot math, signature check, message text (no Firebase, unit-tested)
  src/providers.js        PayMongo, Semaphore and Gmail calls
  test/core.test.js       run with: cd functions && npm test
public/
  index.html              website
  booking.html            customer's booking page
  admin/index.html        dashboard
  assets/firebase-config.js   paste your Firebase web config here
  assets/shared.js        helpers, availability, REAL Barbers starter menu
  assets/fb.js            picks the backend: Firebase when configured, otherwise demo mode
  assets/firebase-backend.js · demo-backend.js
  assets/site.js · booking.js · admin.js · styles.css
.github/workflows/pages.yml   publishes public/ to GitHub Pages
tools/stamp_assets.py     adds ?v=<hash> to scripts and styles so visitors always get the latest version
```

## Notes

- **Customer data**: the booking form asks customers to agree to how their name, number and email are used, as the Data Privacy Act expects. Give dashboard access only to staff who need it.
- **Spam protection**: one unpaid booking per mobile number at a time. For more protection, turn on Firebase **App Check** with reCAPTCHA.
- **Photos**: upload the homepage photo, gallery and team photos in the dashboard under **Website**. They're resized in the browser before upload. Reviews and the announcement bar are managed there too.
- **Logo**: the shop badge is in `public/assets/` (`logo.png` large, `logo-192.png` for headers, `favicon-64.png`, `apple-touch-icon.png`, and `logo-brick.jpg` for link previews). Replace those files to change it.
- **Exports**: Income & expenses → **Download Excel** gives a workbook with Summary, Day by day, Sales and Expenses sheets (real dates, peso formatting, filters and totals). **CSV** is the plain version for other apps. Both cover the period you have selected.
- **Firebase SDK version**: the pages load Firebase 10.14.1 from Google's CDN. To update, change the version in `public/assets/fb.js`.
