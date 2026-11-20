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

Setup comes in three parts. **Part 1 costs nothing and needs no card.** It puts the website online, with the real menu and the full dashboard (schedule, walk-ins, checkout, income and expenses, barbers, clients, inventory). Customers book by calling or messaging the shop.

**Part 2 is everything that involves payment:** Firebase's Blaze plan (needs a card), PayMongo and Semaphore credits. It adds online booking with the ₱200 deposit, texts and emails, and photo uploads.

**Part 3, done last,** moves the site to the shop's own domain, R3ALBarbers.com.

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

That's the only account you make by hand. Everyone else gets their sign-in from the dashboard: **Staff → Edit → Sign-in** (email, a starting password, and what they can see). Then set your **owner PIN** in Shop setup → Owner PIN, and print the **time clock QR** (Staff → Time in and out → Time clock QR).

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

#### 12. Switch over from Setmore

1. Add every Setmore booking that's still upcoming in the dashboard (Schedule → + Booking) so those times are blocked online.
2. Turn off new bookings in Setmore. Keep the account open until its last booking has passed.
3. Change the **Book** button on the Facebook page and the website link on the Google Business Profile to the new site.

### Part 3: domain name, R3ALBarbers.com (do this last)

Once Part 2 works, move the site from `<your-project-id>.web.app` to **r3albarbers.com**.

#### 13. Buy the domain

Buy `r3albarbers.com` at Cloudflare Registrar (https://dash.cloudflare.com), Namecheap or Porkbun, about ₱600–900 a year, and turn on auto-renew.

#### 14. Connect it to Firebase Hosting

Firebase console → Hosting → **Add custom domain** → `r3albarbers.com` (add `www.r3albarbers.com` as a redirect). Copy the DNS records it shows into your domain seller's DNS settings, then wait for **Connected** with https (usually within an hour, up to 24 hours).

#### 15. Point everything at the new address

1. Firebase console → Authentication → Settings → **Authorized domains** → add `r3albarbers.com` and `www.r3albarbers.com`.
2. In `functions/.env` set `SITE_URL=https://r3albarbers.com`, then `firebase deploy --only functions`.
3. Change the Facebook Book button, the Google Business Profile website and the Instagram bio link to r3albarbers.com.

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

## Staff sign-ins, owner PIN and activity log

- **Who sees what.** Give each person a sign-in in **Staff → Edit → Sign-in**:
  - **Owner:** everything.
  - **Front desk:** Schedule, walk-ins, bookings, Checkout, Clients and the cash count. No income pages, pay, inventory or settings.
  - **Own schedule and pay only (barbers and stylists):** **My day** (their clients today and the next 7 days, and their time in) and **My pay** (days in, commission, tips, late deductions, what's owed and past payouts). Nothing about anyone else.
  The Firestore rules enforce this, so it's not just hidden buttons.
- **Owner PIN** (Shop setup → Owner PIN). The front desk needs it to void a sale, mark a down payment refunded, delete a client or a visit, or open owner pages. Typing it opens owner powers for 5 minutes on that sign-in (a banner counts down, and "Lock now" closes it early). The PIN is checked on the server and stored hashed. 5 wrong tries lock it for 15 minutes. On a shared phone or tablet signed in as the owner, tick **Lock owner pages on this device** so income, pay and settings ask for the PIN there too.
- **Activity log** (owner only). Records who did what and when, for example "Alex · Front desk · Voided a ₱299 sale for a walk-in (11:20 AM, Mac, Cash)". It covers:
  - sales, voids and refunds
  - no-shows, cancelled and deleted visits, deleted clients
  - expenses and payouts
  - pay plan, price and settings changes
  - leave and attendance marks
  - time in/out and time fixes
  - cash counts, the owner PIN (including wrong tries) and sign-ins
  Filter by person, type or a search. Nobody can edit or delete an entry, not even the owner.

## Time in and time out

- **How it works.** Print the QR from Staff → **Time in and out** → **Time clock QR** and put it by the door. Staff scan it with their own phone and tap **Time in** when they arrive and **Time out** when they leave. They sign in with their own account once; the phone remembers it.
- **Time and location.** The server stamps the time, so changing the phone's clock does nothing. If the shop's location is set (Shop setup → Time clock → "Use this phone's location", done inside the shop), a scan from more than 300 m away is flagged. If someone shares a photo of the QR, tap **Make a new code** and the old one stops working.
- **Late rule.** Time in by 9:00 AM (Shop setup → Time clock; one person can have their own start time in Staff → Edit). **9:01 is late.** Each started 15 minutes late is taken off their pay: senior barbers ₱50, junior barbers ₱15. So 9:01–9:15 costs one block, 9:16–9:30 two, and so on. Other staff start at ₱0; set anyone's amount in Staff → Edit → **Late deduction per 15 minutes**.
- **Where it shows.** The staff member sees the deduction right away on their phone and in My pay. The owner sees it in Who's in, in the **Time in and out** table (times, hours, late, deduction) and under "Earned" in the pay table. Deductions come off "Earned" and "Owed now".
- **Fixing records.** Forgot to time out, or had a good reason to be late? **Edit** the record: change the times or tick **Excuse being late**. **+ Add time** is for someone who forgot to scan. Every change goes in the activity log.
- Timing in also counts as a day in for daily pay.

## Closing the day

**Close the day** (Schedule or Overview) shows on one screen:
- money in by payment type, plus down payments paid online earlier
- the cash drawer: starting cash + cash sales − cash expenses, against what you counted, with "short" or "extra"
- each person's time in, clients, sales, tips and no-shows
- visits marked done but not paid
**Text to owner** sends a short summary to the owner's mobile (Shop setup → Shop details → Owner's mobile) through Semaphore. **Copy** puts the same text on the clipboard, for Messenger.

## Barber pay

Barbers earn their **daily amount or their commission, whichever is higher**, for each day they work: senior (Deluxe) barbers ₱700 or 50% of their services, junior (Regular) barbers ₱500 or 40%. On a slow day the shop tops up to the daily amount; on a busy day they keep their full commission. The barber's share is rounded down to the whole peso, so on a ₱399 Deluxe Haircut the barber's commission is ₱199. Tips go fully to the barber.

- Starting pay plans: seniors ₱700 or 50%, juniors ₱500 or 40% (*Daily minimum or commission*); Dave ₱1,000 a day + 45%; Luz and Liza ₱500 or 40%; Airyl ₱700 a day + 70% of braids; Alex ₱20,000 a month. Change any of it in **Staff → Edit → How they're paid**.
- Example (junior, ₱500 or 40%): ₱2,000 of services → ₱800. ₱750 of services → ₱300 commission + ₱200 from the shop = ₱500.
- **Product fee (stylists):** on services that use salon products (color, rebond, keratin, treatments; tick "Uses salon products" on the service), the shop takes ₱50 first if the service is under ₱1,500, or ₱100 from ₱1,500 up, then the rest is split. Services without products are a straight split. Example: a ₱1,200 color by Dave → shop ₱50, then 55% of ₱1,150 = ₱632 for Dave, ₱568 for the shop. Set it per person in **Staff → Edit → Product fee**.
- **Roles:** barber, hair stylist and nail technician take bookings and earn commission. Receptionist and maintenance only get daily pay: they're in Who's in and the pay table, but not on the website, in bookings or at checkout. Change any of it in **Staff → Edit**.
- A day counts as worked when the barber rang up a sale that day, or when it's one of their scheduled days and they weren't marked absent. Mark absences, or someone coming in on a day off, in **Schedule → Who's in**.
- Days only count from the barber's start date and from the first sale recorded in the system, so old dates don't build up pay.
- **Leave:** Staff → **Leave** → **+ Add leave**. Pick the person, the dates, and **Paid** or **Unpaid**. Paid leave counts as a day in (their daily pay, or the daily minimum); unpaid leave isn't paid, and a monthly salary goes down by that day (the salary ÷ the days in that month). Leave days are taken off the website calendar for that person, and Who's in shows "Paid leave" or "Unpaid leave".
- **Barbers** shows days worked, daily pay, commission, tips, total earned, and what's owed since the last payout.
- **Pay vs what each barber brings in** (Barbers tab): his service sales next to what the shop pays him (daily pay + commission), pay as a % of his sales, and how much is left for the shop or how much more the shop pays than he brings in. A barber pays for himself once his services pass his daily pay ÷ the shop’s share each day (₱1,250 for ₱500/day + 60%, ₱1,400 for ₱700/day + 50%). The Excel Summary has the same columns.

## Booking extras for customers

- **Choose your barber first:** "Have a favorite barber? Choose him first" at the top of booking. Picking a barber shows only his level's haircuts and his free hours.
- **Next available:** the date step shows the earliest free slot ("Tomorrow, 9:00 AM with Mac"), for the chosen barber or anyone. One tap picks it.
- **Book for two:** in "Your details", add a second person with the **same services or their own** (their own haircut level and add-ons, or women's services): then pick when: the same time with another barber or stylist, right after with the same barber when he does their services too, or **choose their own time** (any barber who does their services, any day in the next two weeks, any free time). Both slots are held together and one checkout pays both deposits (₱400). The second person gets their own booking, shown under "Also booked" on the main booking page.
- **Remember me:** ticked by default. The customer's name, number, email and last choice are saved on **their own phone only** (nothing extra on the shop's side). Next visit they see "Welcome back, Juan · Book the same again". "Not Juan?" forgets it.
- **Book the same again:** links like `/?svc=h1,h6&barber=lyndon#book` open booking with those services and that barber picked. The customer's booking page uses this after a visit, and the "time for a trim" email's **Book now** button links to their last services and barber.

- **Required details:** name, an 11-digit mobile number (09… or 639…), a valid email and the terms checkbox must be filled before the deposit. Missing or wrong fields turn red with a short message, and tapping Pay jumps to the first one.
- **Booking Terms and Privacy Policy:** `terms.html` and `privacy.html`, linked from the checkbox and the footer. They fill in the deposit, late rule, reschedule window, address and contact from **Dashboard → Settings**, so they change when the policy does. They're a starting template: have them checked before going live.
- **Cookies:** the site sets no tracking or advertising cookies and no analytics, so no cookie banner is needed. "Remember me" uses the customer's own browser storage, explained in the Privacy Policy.

## Promos, events and the gallery

- **Promos & events:** Website → **Promos & events**. Post a promo or an event with optional dates, a picture, a promo code (customers tap “Book with this code” and it's applied for them) or a link. Ended ones hide themselves. The section only shows when something is posted. Each one gets a **generated banner** in the shop's look (brick wall, lit badge, the discount in big slab letters, the code); add your own picture to use that instead. **Download banner** saves it as a 1200 × 630 PNG for Facebook or Instagram.
- **Fresh from the chair:** add photos yourself in Website → **Fresh from the chair** (newest first), and/or connect the Facebook page in Website → **Facebook photos**: paste a Page access token once and the page's newest photos lead the gallery, refreshed every 3 hours. Steps to get the token are in the Go-Live Checklist.
- **Services menu:** haircut tiers side by side, bundles as cards (a swipe row on phones), add-ons and other groups as two- or three-column lists on computers.

- **Book months ahead:** the date step is a month calendar; customers can book up to 120 days ahead by default (Shop setup → Online booking rules → Book up to, max 365).
- **Getting around:** every dashboard page has a Back button, and pop-ups have Back too (Edit client goes back to the client). The phone's back button closes pop-ups on the dashboard and the website instead of leaving the page. Name fields in Add walk-in, New booking and Checkout search your clients and start with **Add new client**.
- **“Any available” bookings:** when a client doesn't pick a barber, the system only holds a free chair (whoever has the fewest visits that day, not always the first chair) and the client sees “the shop will assign”. These show as **Any barber** with an **Assign barber…** menu on Schedule (filter: *Needs a barber*) and in Overview → Needs attention. The menu lists only barbers who are free at that time and can do the service.
- **Receipts:** every checkout makes a receipt. Staff see it right away with a **Send to client** box (copy link, text it from the shop phone). Clients with a booking or a QR walk-in ticket see it on their booking page, and the backend texts a short receipt to their number and emails the full one with a link to `receipt.html` (turn texts off in Shop setup → *Text clients a short receipt*). Receipts show only what the client paid, never commission.
- **My visits (client accounts):** `account.html`. Clients log in with their mobile number and a 6-digit code sent by text (only numbers with a booking, visit or client record; 1 code a minute, 5 a day, 5 tries; logins last 30 days). They see upcoming bookings, past visits with receipts, their loyalty card and a *Book the same again* button. In the demo the code is shown on screen.
- **Live walk-in wait:** the website shows “Walk-ins: about 20 min wait” (or “a chair is free now”) in the hero and on the walk-in form, from a no-names copy of today's queue (`public/queue`), using the barbers working today and about 40 minutes a cut.
- **Reference photo:** clients can add a photo of the cut they want when booking, joining the queue, or later on their booking page. Staff see a **Photo** tag on Schedule and a button at Checkout. Only the shop can see these photos.
- **No down payment for junior barbers:** each barber has a *No down payment for online bookings* setting (on for the junior barbers). Bookings with them, or “any available” for a service only juniors do, are confirmed straight away with nothing to pay online; the client pays everything at the shop. These show *No down payment* on Schedule.
- **Checkout:** services have no quantity (each is on the ticket once); products still do.
- **Pay plans (Staff → Edit → How they're paid):** *Daily minimum or commission* (seniors ₱700 or 50%, juniors ₱500 or 40%, Luz and Liza ₱500 or 40%: whichever is higher; the shop tops up slow days), *Daily pay + commission* (Airyl ₱700 + 70% of braids; Dave ₱1,000 + 45%), or *Monthly salary* (Alex ₱20,000). Half of a forfeited down payment goes to that booking's barber. Staff → **How each person is paid** shows each plan, an example and this period's total.
- **Down payment and late rules (owner, Nov 2026):** only senior barbers take a ₱200 down payment. Juniors: 5-minute grace, then the slot can go to a walk-in. Seniors: 20-minute grace; after that the down payment is kept and the full price is owed (**Collect late fee** on Schedule). Cancel 48+ hours before for a refund (shows *Send back ₱200* → *Mark refunded*). A pop-up with these rules must be ticked before booking a senior barber.
- **Menu (owner, Nov 2026):** real nail menu with polish options (the client picks; the price changes), braids (Airyl, Lyndon), haircuts and nails block 60 minutes (add-ons fit in the same hour), loyalty: every 11th visit free, *Regular* tag at 3 visits, birthday promo: Signature Haircut for ₱249 during the birthday week, booking up to a year ahead.
- **Birthdays:** clients can add their birthday (month and day only) when booking online, joining the walk-in queue, or when staff add a walk-in, a booking or a client. Walk-ins added in the dashboard need a name and are saved as clients. Clients → **Birthdays coming up** lists the next two weeks; a visit on someone's birthday shows a ★ Birthday today chip, and Checkout shows a **Birthday free cut** button during their birthday week.
- **Our products:** the shop's own Liquid Pomade, Styling Powder and Sea Salt Spray (photos in `public/assets/products/`) are added to Inventory when you save the starter menu. Set each one's selling price and stock; until a price is set the website shows "Ask for price". In Inventory, edit a Retail item → tick **Show on the website**, add a short description, a tag (e.g. Best seller) and a photo. The website shows name, price and In stock / Out of stock (never cost or stock counts), kept in step automatically. Customers can tap **Add to my booking**; it shows in their price breakdown and lands in the booking notes as "Set aside for me: …".

- **Nails:** a Nails tab in the menu and in booking (Luz, nail technician). The nail services are a sample menu with placeholder prices until the owner sends the real one (Shop setup → Services).
- **Hair + nails in one visit (For her only):** in step 1 (Services), under the women's service: **Add nails to this visit?** (or **Add a hair service** when booking nails); the timing (same time, right after, another time) is chosen under the time in step 3. Same client, the extra service goes to the nail technician (or a barber/stylist): at the same time, right after, or another time. It's one booking with one down payment; the extra service shows as its own appointment in the schedule, linked to the main one.
- **Day check (Schedule, under the day's list):** walk-ins that came in, were served and paid, are still waiting, or left; bookings served, missed or still to come; money in by payment method; and anything to check. A visit can only become **Done** by ringing it up in Checkout (choosing Done in the status menu opens Checkout), so every finished visit has a payment. Past days flag anyone still "in chair". **Cash drawer:** enter the starting cash and the count at closing; it shows what should be there (start + cash sales − cash expenses) and whether the drawer is short or over. Saved per day.

## Payments, the day of the visit, and after

- **Pay by GCash screenshot:** besides paying online (PayMongo), customers can send the down payment to the shop's GCash number and upload the screenshot on their booking page. The slot stays held while you check it. **Schedule** (and Overview) shows **GCash screenshots to check**: open one, match it with your GCash history, then **Approve** (the booking is confirmed and the client gets the usual confirmation text and email) or **Reject** (the slot opens again and the client is told to call). Screenshots are stored as small images in Firestore, so this works on the free plan. Turn it off in Shop setup → Online booking rules.
- **Price breakdown:** the booking summary lists every service (and the second person's), any promo, the estimated total, the down payment now and what's left to pay at the shop.
- **Promo codes:** Shop setup → **Promo codes**. Percent or peso off, optional minimum, last day and max uses. Customers type the code when booking; it's checked on the server, shown on their booking, and filled in automatically as the discount at checkout. The down payment doesn't change.
- **Live queue:** on the day, the customer's booking page shows how many clients are ahead of them with their barber, and updates every minute.
- **Running late:** on the day, the booking page has 5 / 10 / 15 min buttons. The dashboard shows a "10 min late" tag on the booking and in Overview → Needs attention.
- **Walk-in QR:** Schedule → **Walk-in QR** → **Print poster**. Customers in the shop scan it, type their name and number, and join the walk-in queue (no down payment). They get a live ticket ("#3 · 2 ahead of you") and show up in Schedule → Walk-in queue tagged "Joined by QR".
- **Rating request:** after checkout, the customer gets a text and email asking how their cut was. Ratings show in Website → **Ratings from customers**; good ones go on the website with one tap, and each barber's average shows on their profile.
- **Loyalty card:** the stamp card is on the customer's booking page (and the "My loyalty card" link when they come back to the website).
- **Cut photo:** open a finished visit (Edit) → **Add photo**. The client sees it on their booking page so they can ask for the same cut; **Add to gallery** puts it on the website.

- **Served late:** when a client booked with a senior barber comes more than 20 minutes late (5 for juniors) and still gets their cut, tap **Served late** on the booking. Checkout opens with the full price and the down payment isn't taken off; it's kept, half to the barber. **No-show: late fee** is for when they didn't come or weren't served.
- **Add-ons on the booking page:** "Pay at the shop" includes add-ons picked for the visit (and the second person's), so the client sees the real amount.
- **Official receipt numbers (BIR):** Shop setup → **Official receipts (BIR)** → tick "Number every receipt in order", and fill in the prefix (e.g. OR-), the next number, your TIN and BIR permit / ATP number. Every sale then gets the next number in order (OR-000001, OR-000002, …), counted on the server so two phones never get the same number, and the receipt says "Official receipt" with the TIN and permit. The Excel export has a **Sales book** sheet (date, receipt number, client, gross sales, discount, net sales, payment, paid online earlier, paid at the shop) for your bookkeeper. Have your accountant confirm the setup with your BIR RDO before you rely on it as your official receipts.
- **Backups:** Shop setup → **Backups** → **Download full backup** (one file with everything) or **Download clients, sales and bookings (Excel)**. On the live site, `weeklyBackup` also saves a full copy to Firebase Storage every Sunday at 3 AM and keeps the last 12 weeks.

## Website extras

- **Events & promos:** always on the website (button "Events" in the menu). Add events and promos in Website → Promos & events; when there's nothing on, it says so and points to your Facebook page.
- **Leave a review:** a button next to the reviews (and after a 4- or 5-star rating) opens your Google review page. Set the link in Website → Star rating → Link to the reviews.
- **Style gallery:** tag each gallery photo with a style and barber (Website → Gallery). Customers filter by style, and **Book this look** books that barber with the look in the notes.
- **Barber profiles:** tap a barber to see their bio (Staff → Edit → Short bio), days in, starting price, rating and recent work.
- **Map:** a Google map under Visit, with your own "How to find us" note (Shop setup).
- **Open now:** in the header, hero and next to the map.
- **Messenger:** a floating "Message us" button, made from your Facebook page link (or set your own in Shop setup).
- **FAQ:** "Good to know" section. It starts with suggested answers written from your booking rules; edit them in Website → Questions (FAQ).

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
