// English / Tagalog for the customer pages. The pages are written in English; L(html) swaps whole
// phrases for their Tagalog version when the customer picks TL. Phrases not listed stay in English.
const KEY = 'rb-lang';
let cur = 'en';
try { cur = localStorage.getItem(KEY) === 'tl' ? 'tl' : 'en'; } catch (_) {}
export const lang = () => cur;
export function setLang(v) { cur = v === 'tl' ? 'tl' : 'en'; try { localStorage.setItem(KEY, cur); } catch (_) {} }

// Exact phrases (text between tags, placeholders and aria-labels)
const TL = {
  // header & sections
  'Services': 'Serbisyo', 'Gallery': 'Gallery', 'Team': 'Barbers', 'Visit': 'Puntahan', 'Book now': 'Mag-book', 'Open now': 'Bukas na', 'Closed now': 'Sarado pa',
  'Book an appointment': 'Mag-book ng appointment', 'See prices': 'Tingnan ang presyo', 'Hours': 'Oras', 'Deposit to book': 'Down payment', 'Walk-ins': 'Walk-in', 'Welcome': 'Welcome',
  'Menu': 'Menu', 'Services & prices': 'Serbisyo at presyo', 'For him': 'Para sa lalaki', 'For her': 'Para sa babae', 'Nails': 'Nails',
  'Style gallery': 'Style gallery', 'Fresh from the chair': 'Bagong gupit', 'All': 'Lahat', 'Book online': 'Mag-book online', 'Bookings': 'Booking',
  'The team': 'Ang team', 'Meet your barbers': 'Kilalanin ang mga barber', 'Profile': 'Profile', 'Reviews': 'Reviews', 'What clients say': 'Sabi ng mga customer',
  'Questions': 'Mga tanong', 'Good to know': 'Dapat mong malaman', 'Ask us on Messenger': 'Magtanong sa Messenger', 'Message us': 'Mag-message',
  'Find us': 'Paano pumunta', 'Get directions': 'Direksyon', 'Address': 'Address', 'Call or text': 'Tumawag o mag-text', 'How to find us': 'Paano kami hanapin',
  'Open in Google Maps': 'Buksan sa Google Maps', 'Booking policy': 'Patakaran sa booking', 'Copy': 'Kopyahin', 'Booking Terms': 'Booking Terms', 'Privacy Policy': 'Privacy Policy',
  'Book a chair': 'Mag-book ng upuan', 'Days in': 'Mga araw na pasok', 'Recent work': 'Mga gawa niya', 'Close': 'Isara',
  // booking steps
  'Booking progress': 'Progress ng booking', 'Barber': 'Barber', 'Stylist': 'Stylist', 'Date & time': 'Araw at oras', 'Details': 'Detalye',
  'Choose services': 'Pumili ng serbisyo', 'Choose your barber': 'Pumili ng barber', 'Choose your stylist': 'Pumili ng stylist', 'Pick a date and time': 'Pumili ng araw at oras',
  'Your details': 'Ang detalye mo', 'Required': 'Kailangan', 'Any available': 'Kahit sino', 'Earliest free chair': 'Pinakamaagang bakanteng upuan',
  'Deluxe or Regular?': 'Deluxe o Regular?', 'Choose one': 'Pumili ng isa', 'Add extras': 'Dagdag na serbisyo', 'Optional': 'Opsyonal',
  'Pick a haircut first, then add extras.': 'Pumili muna ng gupit, saka magdagdag.', 'Pick a haircut first.': 'Pumili muna ng gupit.', 'Choose a service first.': 'Pumili muna ng serbisyo.',
  'Pick a date to see free times.': 'Pumili ng araw para makita ang bakanteng oras.', 'Checking free times…': 'Tinitingnan ang bakanteng oras…',
  'Morning': 'Umaga', 'Afternoon': 'Hapon', 'Evening': 'Gabi', 'Closed': 'Sarado', 'Off': 'Day off', 'Next available': 'Pinakamaaga', 'Book this': 'I-book ito', 'Selected': 'Napili',
  'No times left on this day. Try another date.': 'Wala nang bakanteng oras sa araw na ito. Subukan ang ibang araw.',
  'Have a favorite barber? Choose him first': 'May paboritong barber? Piliin muna siya', 'Change': 'Palitan',
  'Full name': 'Buong pangalan', 'Mobile number': 'Mobile number', 'Email (for your confirmation and booking link)': 'Email (dito ipapadala ang confirmation at booking link)',
  'Notes (optional)': 'Notes (opsyonal)', 'Style, reference photo on Facebook, anything we should know': 'Style, reference photo sa Facebook, o anumang dapat naming malaman',
  'Remember my details on this phone for next time': 'Tandaan ang detalye ko sa phone na ito',
  'Booking for someone else too? Add a second person': 'May kasama ka? Magdagdag ng isa pang tao', 'Second person': 'Pangalawang tao', 'Remove': 'Tanggalin',
  'Their name': 'Pangalan niya', 'Their services': 'Serbisyo niya', 'Same as mine': 'Pareho sa akin', 'Choose different': 'Iba ang pipiliin', 'When': 'Kailan',
  'Choose their own time': 'Siya ang pipili ng oras', 'Any day, any free time, any barber': 'Kahit anong araw, oras at barber', 'One after the other': 'Sunod-sunod',
  'Their barber': 'Barber niya', 'Their stylist': 'Stylist niya', 'Day': 'Araw', 'Time': 'Oras', 'Same day': 'Parehong araw', 'Any': 'Kahit sino',
  'Your booking': 'Ang booking mo', 'Price breakdown': 'Detalye ng presyo', 'Estimated total': 'Tantiyang kabuuan', 'Down payment now': 'Down payment ngayon',
  'Pay at the shop': 'Babayaran sa shop', 'Pick a service to see the price breakdown.': 'Pumili ng serbisyo para makita ang presyo.',
  'Have a promo code?': 'May promo code ka?', 'Promo code': 'Promo code', 'Apply': 'Gamitin',
  'Comes off your bill at the shop. The down payment stays the same.': 'Ibabawas sa bill mo sa shop. Pareho pa rin ang down payment.',
  'How do you want to pay?': 'Paano ka magbabayad?', 'Pay online': 'Magbayad online', 'Send by GCash': 'Ipadala sa GCash',
  'GCash, Maya, card or QR Ph. Confirmed right away.': 'GCash, Maya, card o QR Ph. Kumpirmado agad.',
  'Send to our number, then upload the screenshot. The shop confirms it.': 'Ipadala sa number namin, saka i-upload ang screenshot. Kukumpirmahin ng shop.',
  'Your slot is held for 30 minutes while you send the payment and upload the screenshot.': 'Hawak namin ang slot mo nang 30 minuto habang nagpapadala ka at nag-a-upload ng screenshot.',
  'Fill in your details to continue.': 'Punan ang detalye mo para magpatuloy.', 'Secure payment by PayMongo: GCash, Maya, card or QR Ph': 'Ligtas na bayad sa PayMongo: GCash, Maya, card o QR Ph',
  'Can’t find a time that works? Join the waitlist': 'Walang swak na oras? Sumali sa waitlist', 'Join the waitlist': 'Sumali sa waitlist', 'Any time': 'Kahit anong oras',
  'Welcome back': 'Welcome back', 'Book the same again': 'I-book ulit ang pareho', 'My loyalty card': 'Loyalty card ko',
  'Enter your full name.': 'Ilagay ang buong pangalan mo.', 'Enter your mobile number.': 'Ilagay ang mobile number mo.',
  'Enter an 11-digit mobile number, like 0917 123 4567.': 'Ilagay ang 11-digit na number, gaya ng 0917 123 4567.',
  'Enter your email. Your confirmation and booking link go there.': 'Ilagay ang email mo. Doon ipapadala ang confirmation at booking link.',
  'Check your email address, like juan@gmail.com.': 'Pakitingnan ang email mo, gaya ng juan@gmail.com.',
  'Please agree to the Booking Terms and Privacy Policy.': 'Pakisang-ayunan ang Booking Terms at Privacy Policy.',
  'Enter the second person’s name.': 'Ilagay ang pangalan ng pangalawang tao.', 'Pick when the second person comes.': 'Piliin kung kailan darating ang pangalawang tao.',
  'Pick a day and time for the second person.': 'Pumili ng araw at oras para sa pangalawang tao.',
  // walk-in
  'At the shop now?': 'Nasa shop ka na?', 'Join the walk-in queue': 'Pumila bilang walk-in', 'Your name': 'Pangalan mo', 'What are you getting?': 'Ano ang ipapagawa mo?',
  'Deluxe haircut': 'Deluxe na gupit', 'Regular haircut': 'Regular na gupit', 'Not sure yet': 'Hindi pa sigurado', 'Whoever’s free first': 'Kung sino ang unang bakante',
  'Join the queue': 'Pumila', 'Want a set time instead? Book an appointment': 'Gusto ng tiyak na oras? Mag-book ng appointment',
  'No down payment. We call names in order, and clients with a booking go first at their time.': 'Walang down payment. Tatawagin ang pangalan ayon sa pila, at mauuna ang may booking sa oras nila.',
  'Walk-in queue': 'Pila ng walk-in', 'See my place in line': 'Tingnan ang puwesto ko sa pila',
  'We’ll call your name in order. Keep this page open to see how many are ahead of you.': 'Tatawagin ang pangalan mo ayon sa pila. Buksan lang ang page na ito para makita kung ilan pa ang nauuna sa iyo.',
  // booking page
  'Add to calendar': 'Idagdag sa calendar', 'Copy booking code': 'Kopyahin ang booking code', 'Need to change it?': 'Kailangang baguhin?', 'Reschedule': 'Ilipat ang oras',
  'Cancel booking': 'I-cancel ang booking', 'Book again': 'Mag-book ulit', 'Make a new booking': 'Gumawa ng bagong booking', 'Confirmed': 'Kumpirmado',
  'Waiting for deposit': 'Hinihintay ang down payment', 'Finish your booking': 'Tapusin ang booking mo', 'Thanks for visiting': 'Salamat sa pagbisita',
  'See you on your next cut.': 'Kita tayo sa susunod mong gupit.', 'Loyalty card': 'Loyalty card', 'Also booked': 'Kasama sa booking', 'Their booking': 'Booking niya',
  'Deposit': 'Down payment', 'Running late?': 'Male-late ka?', 'Tell the shop': 'Sabihan ang shop',
  'How was your cut?': 'Kumusta ang gupit mo?', 'Send rating': 'Ipadala', 'Thanks for the rating!': 'Salamat sa rating!',
  'Pay by GCash': 'Magbayad sa GCash', 'Upload screenshot': 'I-upload ang screenshot', 'Checking your payment': 'Tinitingnan ang bayad mo',
  'Your cut': 'Ang gupit mo', 'View booking': 'Tingnan ang booking', 'Haircuts from': 'Gupit simula', 'Book again': 'Mag-book ulit',
  'Pay by GCash': 'Magbayad sa GCash', 'Choose screenshot': 'Pumili ng screenshot', 'JPG or PNG from your gallery': 'JPG o PNG mula sa gallery mo',
  'GCash reference number (optional)': 'GCash reference number (opsyonal)', 'Got your screenshot': 'Natanggap namin ang screenshot mo',
  'Copy number': 'Kopyahin ang number', 'Take a screenshot of the receipt that shows the amount and reference number.': 'I-screenshot ang resibo na may halaga at reference number.',
  'Upload it below. We confirm it and text you.': 'I-upload sa ibaba. Kukumpirmahin namin at ite-text ka.',
  'Stay close to the shop. We’ll call your name. This page updates by itself.': 'Manatili malapit sa shop. Tatawagin ang pangalan mo. Kusang nag-a-update ang page na ito.', 'You’re next': 'Ikaw na ang susunod', 'In the chair': 'Nasa upuan na'
};
// Phrases with numbers or names in them
const PATTERNS = [
  [/^Pay (₱[\d,]+) deposits?$/, (m, a) => `Magbayad ng ${a} down payment`],
  [/^Book and pay (₱[\d,]+) by GCash$/, (m, a) => `I-book at magbayad ng ${a} sa GCash`],
  [/^Book with (.+)$/, (m, a) => `Mag-book kay ${a}`],
  [/^Book this look with (.+)$/, (m, a) => `I-book ang look na ito kay ${a}`],
  [/^Price starts at (₱[\d,]+)$/, (m, a) => `Simula sa ${a}`],
  [/^Today, (.+)$/, (m, a) => `Ngayong ${a}`],
  [/^(\d+) in today$/, (m, a) => `${a} ang pasok ngayon`],
  [/^Open now · until (.+)$/, (m, a) => `Bukas ngayon · hanggang ${a}`],
  [/^Opens today at (.+)$/, (m, a) => `Magbubukas ngayong ${a}`],
  [/^Closed now · opens tomorrow at (.+)$/, (m, a) => `Sarado pa · bukas ng ${a}`],
  [/^Same time, (.+), with another barber$/, (m, a) => `Parehong oras, ${a}, sa ibang barber`],
  [/^Right after, (.+), with (.+)$/, (m, a, b) => `Pagkatapos mo, ${a}, kay ${b}`],
  [/^Down payment now \(2 people\)$/, () => 'Down payment ngayon (2 tao)'],
  [/^Each person needs the (₱[\d,]+) down payment, so (₱[\d,]+) in total\.$/, (m, a, b) => `Bawat tao ay may ${a} down payment, kaya ${b} lahat.`],
  [/^You’re number (\d+)$/, (m, a) => `Ikaw ang number ${a}`],
  [/^Your slot is held for (\d+) minutes while you pay\.$/, (m, a) => `Hawak namin ang slot mo nang ${a} minuto habang nagbabayad ka.`],
  [/^(\d+) selected · (.+)$/, (m, a, b) => `${a} napili · ${b}`],
  [/^(\d+) Setmore reviews$/, (m, a) => `${a} review sa Setmore`],
  [/^You have a booking for$/, () => 'May booking ka sa'],
  [/^(\d+) ahead of you$/, (m, a) => `${a} pa ang nauuna sa iyo`],
  [/^Walk-in queue · (.+)$/, (m, a) => `Pila ng walk-in · ${a}`],
  [/^(\d+) min late$/, (m, a) => `${a} minutong late`]
];
function tr(text) {
  const t = text.trim(); if (!t) return text;
  let out = TL[t];
  if (out === undefined) for (const [re, f] of PATTERNS) { const m = re.exec(t); if (m) { out = f(...m); break; } }
  return out === undefined ? text : text.replace(t, out);
}
export function L(html) {
  if (cur !== 'tl') return html;
  return html
    .replace(/>([^<>]+)</g, (m, txt) => '>' + tr(txt) + '<')
    .replace(/\b(placeholder|aria-label|title)="([^"]*)"/g, (m, a, v) => `${a}="${tr(v)}"`);
}
