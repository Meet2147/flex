// Policy pages. Written for this service; have a lawyer read them before launch.
// Operator name, location and support address come from OPERATOR_NAME, OPERATOR_LOCATION and SUPPORT_EMAIL.
import { config, PLANS } from './config.mjs';

const UPDATED = '10 October 2026';
const { pass, free } = PLANS;

export function legalPages() {
  const who = config.operator.name;
  const where = config.operator.location ? `, based in ${config.operator.location}` : '';
  const mail = config.operator.email
    ? `<a href="mailto:${config.operator.email}">${config.operator.email}</a>`
    : '<mark>[support email not set: add SUPPORT_EMAIL]</mark>';

  return {
    terms: {
      title: 'terms',
      body: `
<p>These terms cover your use of flex (the "Service"): the website where you paste links to your apps and get a portfolio page back. The Service is run by ${who}${where} ("we", "us"). By placing an order or making a free page you agree to these terms, the <a href="/acceptable-use">acceptable use policy</a>, the <a href="/refunds">refund policy</a> and the <a href="/privacy">privacy policy</a>.</p>

<h2>1. What the Service does</h2>
<p>You give us the addresses of public websites or App Store listings ("Apps") and a name. Software visits each App's public pages the way a visitor would, takes screenshots, records a short clip where your plan includes one, writes a short description from what it found, and builds one page (your "Page"). Descriptions are written by an AI model (Anthropic's Claude) when available, and otherwise taken from the App's own title and description.</p>
<p>There is no account. Each order has a private link starting with <code>/o/</code> (your "Order Link"), which is how you follow, download and re-capture your Page. Anyone who has that link can do the same, so keep it to yourself. The Page itself, at a link starting with <code>/p/</code>, is public.</p>
<p>The Service is provided as it is and will change as we add and remove features.</p>

<h2>2. Who sells to you: Polar</h2>
<p>Paid orders are sold by Polar (Polar Software, Inc.), our reseller and Merchant of Record. Polar takes your payment and handles sales tax and VAT, and its buyer terms apply to the purchase alongside these terms. We never see or store your card details.</p>

<h2>3. Plans and price</h2>
<ul>
<li><b>Free:</b> up to ${free.apps} Apps, screenshots only. We may limit how many free pages one person makes, and may remove free pages at any time.</li>
<li><b>${pass.name}:</b> a one-time payment of $${pass.price}, shown before you pay, for one Page of up to ${pass.apps} Apps with clips, a zip download of the Page, ${pass.refreshes} re-captures, and hosting for 12 months from the day the Page is first ready. Nothing renews. After 12 months the hosted Page stops being served; the zip is yours to host anywhere for as long as you like.</li>
</ul>
<p>Refunds are covered by the <a href="/refunds">refund policy</a>. Nothing here limits a refund right that consumer law gives you.</p>

<h2>4. You must be 18</h2>
<p>You must be at least 18 to use the Service. If you use it for an organization, you confirm you are allowed to agree to these terms on its behalf.</p>

<h2>5. The Apps you submit</h2>
<p>You keep every right you have in your Apps. You give us permission to visit, copy, screenshot, record, store and display their public content, and to create and host the Page from it, in order to provide the Service, fix runs that fail, and keep the Service secure. That includes passing the content to the providers listed in the privacy policy as far as they need it.</p>
<p>You confirm that:</p>
<ul>
<li>each App is yours, or you have its owner's permission to show it on a portfolio;</li>
<li>each App is publicly reachable without a login;</li>
<li>the Apps and their content do not infringe anyone's rights, and you have any consent needed for people's names or photos that appear on them;</li>
<li>the Apps comply with the acceptable use policy.</li>
</ul>
<p>We do not use your Apps' content or your Page to train AI models. We will not use your Page in our own marketing without asking you first.</p>

<h2>6. Your Page</h2>
<p>Subject to these terms, the Page and its zip are yours to use, host and change. The "made with /flex" credit on hosted Pages stays on Free and ${pass.name}.</p>
<p>The Page is produced automatically. It can contain mistakes: a wrong description, a poor screenshot, a missing App. Check it before you share it. You are responsible for what you publish.</p>

<h2>7. Acceptable use</h2>
<p>The <a href="/acceptable-use">acceptable use policy</a> is part of these terms. If a Page or an order breaks it, we may refuse or cancel the order, remove the Page, and report illegal activity.</p>

<h2>8. Removing content</h2>
<p>If your work appears on a Page without your permission, email ${mail} with the Page's link and what is yours. We remove Pages that pass off someone else's work.</p>

<h2>9. No warranty</h2>
<p>To the extent the law allows, the Service and every Page are provided without warranties of any kind, including that the Service will be uninterrupted or that a Page will be accurate or suit a particular purpose.</p>

<h2>10. Limit of liability</h2>
<p>To the extent the law allows, we are not liable for indirect or consequential loss, or for lost profits, revenue or data. Our total liability for anything connected to an order is limited to what you paid for that order. Nothing here limits liability that cannot be limited by law.</p>

<h2>11. Changes and contact</h2>
<p>We may update these terms; the date at the top shows the latest version, and the version in force when you ordered applies to that order. Questions: ${mail}.</p>`,
    },

    'acceptable-use': {
      title: 'acceptable use',
      body: `
<p>flex makes a portfolio page from links to apps. This page says what you can submit and what you can't. It is part of the <a href="/terms">terms</a>.</p>

<h2>What you can submit</h2>
<p>Your own apps and sites, or ones whose owner has agreed to you showing them. You give us links, a name and, optionally, a handle. You can't upload files or type instructions for the AI.</p>

<h2>How the page is made</h2>
<p>Automatically. Software opens each link the way a visitor would, without logging in, and builds the page from the app's own words, colours and screens. It does not create people, faces or voices.</p>

<h2>What is not allowed</h2>
<ul>
<li><b>Other people's work, passed off as yours.</b> Apps you have no connection to, impersonating a person or company, or anything that infringes copyright, trademark or privacy.</li>
<li><b>Sexual or adult content.</b> Pornographic or sexually explicit material, and anything that sexualizes minors.</li>
<li><b>Harmful content.</b> Violence, self-harm, terrorism, the sale of illegal drugs or weapons, or other illegal activity.</li>
<li><b>Hate and harassment.</b> Content that harasses, threatens or defames people, or discriminates against a person or group.</li>
<li><b>Scams and spam.</b> Phishing, fraud, fake stores, multi-level marketing, or pages made to mislead.</li>
<li><b>Malicious sites.</b> Sites that host malware, or that try to attack, trick or misdirect our capture software.</li>
<li><b>Abuse of the Service.</b> Automated bulk orders, getting around the free plan's limits, or probing the Service's security.</li>
</ul>

<h2>If a page breaks these rules</h2>
<p>We may refuse or cancel the order, remove the page, and report illegal activity. To report a page made with flex, email ${mail} with its link.</p>`,
    },

    refunds: {
      title: 'refunds',
      body: `
<p>${pass.name} is $${pass.price}, paid once, for one page. If we can't make it, you get your money back. If it comes out wrong, we fix it or refund you. Payments and refunds go through Polar, our reseller and Merchant of Record.</p>

<h2>No page, automatic refund</h2>
<p>Sometimes none of the apps in an order can be captured: they need a login, block automated browsers, or are down. When that happens your order page says so and we ask Polar to refund the full amount straight away. You don't need to ask.</p>
<p>If only some apps fail, the page is built from the ones that worked and the order page shows which were left off. Use a re-capture once the app is reachable, or email us.</p>

<h2>Something wrong with the page? Fix or refund</h2>
<p>If your page is broken (it won't load, clips don't play, screenshots are blank) or gets your apps wrong (the wrong site, the wrong name, a description that isn't true), email ${mail} within 14 days of buying, with your order link. You choose: we remake it free, or we refund you in full.</p>

<h2>Not what you hoped for?</h2>
<p>${pass.name} includes ${pass.refreshes} re-captures, which you can run yourself from the order page. Each one captures every app again from scratch. If that doesn't get you there, email us within 14 days and we'll look at it.</p>

<h2>Limits</h2>
<p>Refunds for a page you received are limited to one per customer. Automatic refunds for orders that produce nothing are never limited. The free plan has nothing to refund.</p>

<h2>How refunds reach you</h2>
<p>Polar sends the refund to the card or payment method you used, usually within a few days. Your bank can take another 5 to 10 business days to show it. Refunds are for the full price including tax.</p>
<p>Nothing in this policy limits a refund right that consumer law gives you where you live.</p>

<h2>Contact</h2>
<p>${who}${where}. Email: ${mail}.</p>`,
    },

    privacy: {
      title: 'privacy',
      body: `
<p>This policy explains what personal data flex collects, why, and who sees it. The Service is run by ${who}${where}, who is the controller of that data. Questions and requests: ${mail}.</p>

<h2>1. What we collect</h2>
<ul>
<li><b>What you type.</b> The app links, the name for the page and, if you give one, a handle.</li>
<li><b>What is on your apps.</b> Our software visits each link's public pages and keeps screenshots, a short clip, and text such as titles and headings. If those pages show personal data (a founder's name or photo, say), it can end up on your page.</li>
<li><b>Order records.</b> An order ID, your links, plan, timestamps, progress, and the page we built.</li>
<li><b>Payment details from Polar.</b> Your email address, the Polar order and checkout IDs, and whether the payment went through or was refunded. We never receive card details.</li>
<li><b>Waitlist.</b> Your email address, if you ask to hear when Pro opens.</li>
<li><b>Technical data.</b> Our host logs requests: IP address, browser, pages requested and time. We also use your IP address briefly to limit free pages per day.</li>
<li><b>Email.</b> Whatever you send us when you write in.</li>
</ul>
<p>We don't use advertising or tracking cookies, and we don't run analytics that follow you across sites.</p>

<h2>2. Why we use it</h2>
<ul>
<li>To make, host and deliver your page (our contract with you).</li>
<li>To match Polar's payment to your order, issue refunds and keep the records tax law requires (contract and legal obligation).</li>
<li>To investigate runs that fail, prevent abuse and keep the Service secure (our legitimate interests).</li>
<li>To answer you when you email (contract and legitimate interests).</li>
<li>To send one email when Pro opens, if you joined the waitlist (your consent; reply to opt out).</li>
</ul>
<p>We do not sell personal data, and we do not use your apps' content or your page to train AI models.</p>

<h2>3. Who we share it with</h2>
<ul>
<li><b>Anthropic</b>, whose Claude models write the page copy: the text and a screenshot captured from each app pass through their API while your page is made.</li>
<li><b>Polar</b>, which runs checkout and is an independent controller of your billing data under its own privacy policy.</li>
<li><b>Our hosting provider</b>, which runs the Service and stores orders and pages.</li>
<li><b>Google Fonts</b>, which serves the fonts on our pages and on hosted portfolio pages, and so receives visitors' IP addresses.</li>
<li>Authorities, courts or advisers where the law requires it or to handle a dispute, and a buyer or successor if the Service is sold.</li>
</ul>
<p>Your page is public. Your order link is private, but anyone who has it can see and manage the order.</p>

<h2>4. Where it is processed</h2>
<p>Our providers operate in several countries, including the United States, so your data may be processed outside the country you live in. Where the law requires safeguards for such transfers, we rely on the ones our providers offer.</p>

<h2>5. How long we keep it</h2>
<ul>
<li>${pass.name} pages are hosted for 12 months from the day they are first ready, then stop being served.</li>
<li>Free pages are kept until we remove them or you ask us to.</li>
<li>Order and payment records are kept for as long as tax and accounting law requires.</li>
<li>Waitlist addresses are kept until Pro opens or you ask to be removed.</li>
</ul>

<h2>6. Your rights</h2>
<p>Depending on where you live, you may have the right to see, correct, delete or export your data, and to object to or restrict how we use it. To have a page and its order deleted, email ${mail} with the order link. You can also complain to your local data protection authority.</p>

<h2>7. Children</h2>
<p>The Service is for adults. We don't knowingly collect data from anyone under 18.</p>

<h2>8. Changes</h2>
<p>We'll update this page when the policy changes; the date at the top shows the latest version.</p>`,
    },
  };
}

export const LEGAL_UPDATED = UPDATED;
