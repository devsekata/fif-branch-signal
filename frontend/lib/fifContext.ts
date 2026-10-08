/* What the image analyser is told about FIF before it judges whether a picture is misleading.
 *
 * The misleading check is only as good as this text: the model cannot look anything up, so
 * whatever is "official" has to be written here. Edit it like copy, not like code.
 *
 * Where it comes from. The channels under OFFICIAL CHANNELS were read off fifgroup.co.id on
 * 7 Oct 2026 (the site's own contact, footer and privacy-notice text), and the career channels
 * from a published fact-check of a fake FIFGROUP vacancy. The sections on payment and on what
 * FIF does not do describe how a licensed Indonesian financing company operates and what the
 * known scams look like; FIF's CX team has not signed them off, and should. */
export const FIF_CONTEXT = `ABOUT THE COMPANY
- FIF is PT Federal International Finance, trading as FIFGROUP, a financing company in the Astra group. Its own statement: "PT Federal International Finance 'FIFGROUP' berizin dan diawasi oleh Otoritas Jasa Keuangan".
- It is a financing (leasing / multifinance) company. It is not a bank, not an online lender (pinjol / pinjaman online) and not a cooperative. It does not take deposits or sell investment products.
- Head office: Menara FIF, Jl. T.B. Simatupang Kav. 15, Lebak Bulus, Cilandak, Jakarta Selatan 12440.
- It operates through branch offices and kiosks across Indonesia. Branches appear on signage and on Google Maps as "FIFGROUP - <area>", sometimes "FIF <area>".

PRODUCTS, AND THE NAMES THEY ARE SOLD UNDER
- FIFASTRA: financing for Honda motorcycles, sold through Honda dealers.
- SPEKTRA: multi-product financing — electronics, gadgets, furniture, household goods.
- DANASTRA: multipurpose cash financing secured against a vehicle ownership document (BPKB).
- FINATRA: micro financing for small businesses.
- AMITRA: sharia financing, mainly hajj and umrah.
- FLEET: vehicle financing for companies. FIFGROUP Card: a membership and payment card.
- Partners named on the official site: AstraPay, Astra Buana (insurance), AstraLife.
- Genuine promotions exist: low down payment, light instalments, cashback, door prizes at events, seasonal programmes. A low down payment or a cashback offer is NOT by itself misleading.

OFFICIAL CHANNELS (from fifgroup.co.id)
- Website: fifgroup.co.id and its subdomains (for example e-calendar.fifgroup.co.id, karir-rise.fifgroup.co.id).
- Call centre: HALOFIF 1500-343, also written 1500343 or "(kode area) 1500-343".
- Official WhatsApp: 0895-21500-343, also written +62 895 2150 0343. This is the ONLY official WhatsApp number.
- Email: halofif@fifgroup.astra.co.id. Any address ending in @fifgroup.astra.co.id or @fifgroup.co.id is on the company's own domain. An address on gmail, yahoo, outlook or any other domain is not official.
- Instagram: @fifclub (instagram.com/fifclub). Facebook: FIFCLUB (facebook.com/FIFCLUB). X / Twitter: @fifclub. TikTok: @fifclub. YouTube: youtube.com/user/fifgroup.
- Careers: karir-rise.fifgroup.co.id, the Instagram account "Growing at FIFGROUP", and the FIFGROUP page on LinkedIn.
- Mobile app: FIFGROUP Mobile Customer (FMC), from the official app stores only.
- Older official material may carry other service numbers, for example an SMS number ending in 1500343 or a suggestions line. A number that is not listed above is unverifiable rather than wrong when it sits on otherwise official material; it is a conflict when it is a personal mobile number presented as head-office service, admin, collection or settlement.
- FIF does not run customer service from personal WhatsApp numbers, personal Telegram accounts or personal Facebook profiles. A branch marketing officer may legitimately show a personal number on a flyer for new applications.

HOW PAYMENT WORKS
- Instalments are paid at a FIFGROUP branch cashier, through the FMC app, through AstraPay, by bank virtual account or transfer to an account in the company's name, at minimarkets (Alfamart, Indomaret), at the post office, and through listed e-commerce and e-wallet partners such as DANA.
- FIF never asks for an instalment, a settlement (pelunasan) or any fee to be sent to a bank account or e-wallet in a private person's name.
- A field collector must carry company identification and an assignment letter, and gives an official receipt. Payment to a collector's personal account is not a FIF process.
- FIF never asks for an OTP, a PIN, a password or a full card number, and does not ask customers to install an app from a link or an APK file.

WHAT FIF DOES NOT DO
- It does not charge an up-front "admin fee", "insurance fee", "activation fee" or "deposit" before a loan is disbursed.
- It does not offer loans that are "guaranteed approved" (pasti cair), "without survey", "without BI checking / SLIK" or "without any documents". Credit is assessed.
- It does not offer unsecured online loans (pinjaman online / KTA tanpa jaminan). Cash financing is DANASTRA, against a BPKB.
- It does not sell repossessed motorcycles (motor tarikan / lelang) through personal accounts on social media with payment to a private account.
- It does not charge for job applications. Recruitment is free and goes through the career channels above; a vacancy asking for a registration, training, uniform or travel fee, or sending applicants to Telegram or a data-collection form, is not FIF's.
- It does not announce prize winners who must pay tax or a fee first to claim.
- It does not offer special settlement discounts or "pemutihan" (debt write-off) through a private chat.

KNOWN ABUSE PATTERNS USING THE FIF NAME
- Accounts imitating the brand: "FIF Group Official", "FIFGROUP Pusat", "Admin FIF", "loker.resmi.fifgroup", with the logo and a personal contact number.
- "CS FIFGROUP" phone or WhatsApp numbers published on unrelated websites and in search results, which are personal mobile numbers.
- Loan offers in FIF's name with an up-front fee, usually moved to WhatsApp or Telegram.
- Fake settlement or instalment-relief offers asking for payment to a personal account.
- Repossessed-unit sales at prices far below market, payment by transfer before viewing.
- Fake job vacancies, including paid ones and ones that harvest personal data.
- Prize draws and "customer appreciation" giveaways that ask for a fee, personal data or an OTP.
- Links to look-alike domains, shortened links or APK files presented as the FIF app.
- Edited screenshots of official posts where only the contact number or the account number has been changed.`;
