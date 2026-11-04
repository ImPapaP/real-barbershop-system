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

Once Firebase is connected, the real site lives on Firebase Hosting (step 6). If you keep the GitHub Pages copy too, add its domain under Firebase console → Authentication → Settings → Authorized domains.

No two customers can book the same chair at the same time. Every booking claims its time slots inside a database transaction, and bookings you add by phone in the dashboard block those slots too.

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

You need a computer with **Node.js 22** installed and about an hour.

### 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a project (for example `realbarbers`).
2. Upgrade it to the **Blaze** plan (bottom-left, "Upgrade"). Cloud Functions need it.
3. **Firestore Database** → Create database → location **asia-southeast1 (Singapore)** → production mode.
4. **Authentication** → Get started → enable **Email/Password**.
5. **Storage** → Get started → same location. Website photos (homepage, gallery, team) are stored here.
6. Install the Firebase tools and sign in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
7. Put your project ID in `.firebaserc` (replace `your-firebase-project-id`).

### 2. Connect the website to Firebase

Firebase console → Project settings → Your apps → **Add app → Web**. Copy the `firebaseConfig` values into `public/assets/firebase-config.js`.

Until this is done, every page runs in demo mode (see Live preview above).

### 3. Open the outside accounts

- **PayMongo** (https://dashboard.paymongo.com): sign up and complete business verification to accept real payments. Test keys (`sk_test_...`) work right away, so you can test before verification is done. Turn on the payment methods you want under Settings → Payment Methods.
- **Semaphore** (https://semaphore.co): sign up, buy credits, and register a sender name such as `R3ALBARBERS`. Copy your API key.
- **Gmail app password**: in the shop's Google account, turn on 2-Step Verification, then create an app password at https://myaccount.google.com/apppasswords. Copy the 16-character password.

### 4. Make yourself an admin

1. Firebase console → Authentication → **Add user**: your email and a password.
2. Copy that user's **User UID**.
3. Firestore → Start collection `admins` → Document ID = that UID → add any field, for example `role: "owner"`.

Repeat for each staff member who should use the dashboard. Remove their `admins` document to take access away.

### 5. Settings and secrets

```bash
cd functions
cp .env.example .env        # then edit .env: SITE_URL, SHOP_EMAIL, SMS_SENDER_NAME, PAYMENT_METHODS
npm install

firebase functions:secrets:set PAYMONGO_SECRET_KEY      # sk_test_... for now
firebase functions:secrets:set SEMAPHORE_API_KEY        # or type: none (no texts)
firebase functions:secrets:set GMAIL_APP_PASSWORD       # or type: none (no emails)
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET  # type: none for now, set it in step 7
cd ..
```

`SITE_URL` is `https://<your-project-id>.web.app` until you connect your own domain.

### 6. Deploy

```bash
firebase deploy
```

This uploads the website, the security rules, the database indexes and the booking functions. At the end it prints a **Function URL** for `paymongoWebhook`. Copy it.

### 7. Tell PayMongo where to send payment notices

Run this once, with your secret key and the Function URL from step 6:

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

### 8. Load the menu and team

Open `https://<your-project-id>.web.app/admin/`, sign in, and click **Load starter menu**. It saves REAL Barbers' Setmore services and prices and a starter team (Reymart, Lyndon, Rod, Angelo, and Dave for women's services). Then:

- **Barbers**: fix names, days in, commission rates, and who takes men's or women's bookings.
- **Shop setup**: check the address, hours, prices and durations. Setmore listed every service as 1 hour, so set the real lengths (balayage, rebond and so on take longer). Adjust the booking rules if you need to.

### 9. Test a booking

With the `sk_test_` key, book on the website and pay with PayMongo's test flow. Check that:

- the booking shows as Booked in the dashboard with "₱200 GCash" next to it
- the confirmation email and text arrive
- the time disappears from the website for that barber
- checkout shows "Deposit paid online −₱200"

`firebase functions:log` shows what happened if something doesn't arrive.

### 10. Go live

1. When PayMongo approves the account, set the live key: `firebase functions:secrets:set PAYMONGO_SECRET_KEY` (`sk_live_...`).
2. Repeat step 7 with the live key. Live and test webhooks are separate, so this gives you a new `whsk_` secret. Set it as `PAYMONGO_WEBHOOK_SECRET`.
3. `firebase deploy --only functions`.
4. Optional: Firebase console → Hosting → **Add custom domain**, then update `SITE_URL` in `functions/.env` and deploy again.

### 11. Switch over from Setmore

You chose to start fresh, so:

1. Keep Setmore open until its last existing booking has passed. Stop new Setmore bookings by turning off its booking page.
2. Change the **Book** button on the Facebook page and the website link on the Google Business Profile to the new site.
3. Add every Setmore booking that's still upcoming in the dashboard (Schedule → + Booking) so those times are blocked online.

---

## How a booking works

1. **Customer books.** `createBooking` checks the request, claims the time slots in a transaction (or answers "that time was just taken"), and opens a PayMongo checkout for the deposit.
2. **Customer pays.** PayMongo calls `paymongoWebhook`. The signature is checked, the booking becomes **Booked**, and the email and text go out. The shop's Gmail also gets a "New booking" alert.
3. **Customer doesn't pay.** After 15 minutes, `expireHolds` releases the slot and closes the checkout.
4. **Payment lands after the slot was taken** (rare: the customer paid after the hold ran out and someone else booked). The booking shows as **Paid, slot taken** in the dashboard. Call the client to rebook, or refund them in the PayMongo dashboard and mark the deposit "Refunded".
5. **Reminders.** `sendReminders` runs every 30 minutes.
6. **At the shop.** Checkout subtracts the deposit from the bill. Mark no-shows in the schedule and the deposit is recorded as kept, so it counts as income.

Texts never contain links, because Philippine networks may block texts with URLs. The booking link goes by email.

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
```

## Notes

- **Customer data**: the booking form asks customers to agree to how their name, number and email are used, as the Data Privacy Act expects. Give dashboard access only to staff who need it.
- **Spam protection**: one unpaid booking per mobile number at a time. For more protection, turn on Firebase **App Check** with reCAPTCHA.
- **Photos**: upload the homepage photo, gallery and team photos in the dashboard under **Website**. They're resized in the browser before upload. Reviews and the announcement bar are managed there too.
- **Logo**: the site uses a text wordmark. To use the shop's logo, add the image to `public/assets/` and swap it into the header in `assets/site.js`.
- **Firebase SDK version**: the pages load Firebase 10.14.1 from Google's CDN. To update, change the version in `public/assets/fb.js`.
