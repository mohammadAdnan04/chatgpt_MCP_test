const disposableDomains = require("disposable-email-domains");
const dns = require('dns');
const util = require('util');
const axios = require('axios');

const resolveMx = util.promisify(dns.resolveMx);
const lookup = util.promisify(dns.lookup);

async function domainCanReceiveMail(domain) {
  try {
    const mxRecords = await resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) return true;
  } catch (error) {
    // ENODATA: domain exists but publishes no MX records.
    // RFC 5321 allows mail delivery via the A/AAAA record in that case.
    if (error.code !== "ENODATA" && error.code !== "ENOTFOUND") {
      console.error(`[Anti-Bot] MX lookup failed for ${domain}:`, error.code || error.message);
      return true;
    }
    if (error.code === "ENOTFOUND") return false;
  }

  try {
    const host = await lookup(domain);
    return Boolean(host && host.address);
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") return false;
    console.error(`[Anti-Bot] Host lookup failed for ${domain}:`, error.code || error.message);
    return true;
  }
}

// We will maintain a dynamic set of disposable domains to ensure it's always up-to-date
let dynamicDisposableDomains = new Set(disposableDomains);

// Fetch the absolute latest list of disposable emails on startup and periodically
async function updateDisposableDomains() {
  try {
    const response = await axios.get('https://raw.githubusercontent.com/ivolo/disposable-email-domains/master/index.json');
    if (Array.isArray(response.data)) {
      response.data.forEach(domain => dynamicDisposableDomains.add(domain.toLowerCase()));
      console.log(`[Anti-Bot] Successfully updated disposable email list. Total domains: ${dynamicDisposableDomains.size}`);
    }
  } catch (error) {
    console.error('[Anti-Bot] Failed to update disposable domains list from GitHub, using local package list instead.', error.message);
  }
}

// Initial fetch and then update once every 24 hours
updateDisposableDomains();
setInterval(updateDisposableDomains, 24 * 60 * 60 * 1000);

const personalDomains = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "live.com",
  "msn.com",
  "sharebot.net",
  "compressjpg.io",
  "pazard.com",
  "k7.hush2u.com",
  "aiphotoenhancer.me",
  "buzzcut.ws",
  "leadharbor.org",
  "mailbaby.click",
  "dollicons.com",
  "bizwork.top",
  "mail.io",
  "virgilian.com",
  "sixthirtydance.org",
  "contactbox.work",
  "uselesswebsites.net",
  "dreamvoyage.cc",
  "animateany.com",
  "dropcluster.click",
  "gettranslation.app",
  "qk.hush2u.com",
  "47053d33b32c267b2a0575a8346365d6.com",
  "38.hush2u.com",
  "kt5x.com",
  "fyh.moonairse.com",
  "whitehousecalculator.com",
  "gagcalculator.me",
  "allwebemails.com",
  "rozxs.com",
  "wgtapps.com",
  "anypsj.com",
  "sscbs.du.ac.in",
  "arg.edu.pl",
  "df.mailings.live"
];

const suspiciousTLDs = ['.xyz', '.top', '.icu', '.tk', '.ml', '.pw', '.click', '.stream', '.ws', '.su', '.cam', '.cfd', '.ing', '.edu.pl', '.edu.rs', '.my.id', '.observer', '.space', '.fun', '.host', '.cc'];

// Add specifically known bot domains
const knownBotDomains = [
  'fordmechanic.com',
  'gicik.net',
  'tempmail.ing',
  'tmail.edu.rs',
  'temp-mail.edu.rs',
  'ibymail.com',
  'theeditai.com',
  'animatimg.com',
  'tempyx.com',
  'deepask.app',
  'deep-mail.com',
  'deep-mail.org',
  'tadopig.com',
  'disefl.com',
  'oxforduniversity.edu.pl',
  'pixelpen.info',
  'oeralb.com',
  'ditch.my.id',
  'c35.net',
  'alf5.com',
  'zenvex.edu.pl',
  'suarj.com',
  'undelivered.shop',
  'aifilter.net',
  'start-up.observer',
  '6po.net'
];

// Domains that are explicitly allowed to sign up even if they are not yet in our Elasticsearch company database
const whitelistedCompanyDomains = [
  'growthwizsyam.com',
  'takencake.com',
  'qi.gcclab.com.sa',
  'theleadsbridge.com',
  'thestring.net',
  'sanatalent.sa',
  'kayanhr.com',
  'b2bleads.online',
  'arzanah.com.sa'
];

/**
 * Checks if a domain exists in the Mawsool Search API (Elasticsearch) companies index.
 * If it doesn't exist, it's highly likely a burner or bot domain.
 */
async function isDomainInCompanyDatabase(domain) {
  try {
    const middlewareUrl = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
    
    // We do a very lightweight search specifically for the domain
    // Use company_domain array to match the exact field in Elasticsearch
    const response = await axios.post(`${middlewareUrl}/search`, {
      type: "companies",
      filters: {
        company_name: { include: [domain] }
      },
      limit: 1,
      page: 1
    }, {
      headers: {
        'x-api-key': process.env.MAWSOOL_MIDDLEWARE_KEY || ''
      },
      // 5 second timeout to prevent hanging the signup request
      timeout: 5000 
    });

    // The API might return total as a number (e.g. 1) or a string like "~56M" if we hit a generic wildcard
    // If it returns anything truthy and it's not strictly 0 or "0", we consider it a match
    const total = response.data?.total;
    const isMatch = total && total !== 0 && total !== "0";
    
    return isMatch;
  } catch (error) {
    console.error(`[Anti-Bot] Failed to verify domain ${domain} against Search API:`, error.message);
    // FAIL-OPEN: If our search API is down or times out, we allow the signup to proceed.
    // We don't want to block real users just because our internal search is experiencing a hiccup.
    return true; 
  }
}

async function validateBusinessEmail(email) {
  if (!email) return { isValid: false, msg: "Email is required" };
  
  const emailLower = email.trim().toLowerCase();
  const parts = emailLower.split("@");
  if (parts.length !== 2) return { isValid: false, msg: "Invalid email format" };

  const localPart = parts[0];
  const emailDomain = parts[1];

  // 0. Check if the domain is explicitly whitelisted to bypass ALL blocklist checks
  if (whitelistedCompanyDomains.includes(emailDomain)) {
    console.log(`[Anti-Bot] Allowed signup from whitelisted domain: ${emailDomain}`);
    return { isValid: true };
  }

  // 1. Check against static personal/bot list
  if (personalDomains.includes(emailDomain) || knownBotDomains.includes(emailDomain)) {
    return { isValid: false, msg: "Personal emails are not allowed. Please use a business email to sign up." };
  }

  // 2. Check against dynamic disposable domains list (which includes the NPM package + live updates)
  if (dynamicDisposableDomains.has(emailDomain)) {
    return { isValid: false, msg: "Disposable or temporary emails are not allowed. Please use a valid business email." };
  }

  // 3. Block highly suspicious TLDs and spam patterns
  if (suspiciousTLDs.some(tld => emailDomain.endsWith(tld)) || emailDomain.includes('mailings')) {
    return { isValid: false, msg: "This email domain is not supported. Please use a valid business email." };
  }

  // 4. Block high entropy / bot-like local parts (e.g. zjbikbkpse6jg)
  const consonantsCount = (localPart.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  const vowelsCount = (localPart.match(/[aeiou]/g) || []).length;
  const numbersCount = (localPart.match(/[0-9]/g) || []).length;
  
  const hasTooManyConsecutiveConsonants = /[bcdfghjklmnpqrstvwxyz]{5,}/.test(localPart);
  const isKeyboardMash = localPart.length >= 8 && vowelsCount <= 1 && (consonantsCount + numbersCount) >= 7;

  // Catch specific bot patterns (e.g. mo8okb3pmr1v, mo9t5x1ze9l0)
  const isKnownBotPattern = /^mo[0-9][a-z0-9]{8,10}$/.test(localPart);
  
  // Catch bot generator pattern: 3-5 random letters followed by exactly 2 numbers (e.g., nkv89, gxu56, rrj87)
  const isBotGeneratorPattern = /^[a-z]{3,6}[0-9]{2,3}$/.test(localPart);

  // Catch the latest algorithmic email patterns (e.g., waavin1p0i, aanandkumar.zyuls, reef3592735362190, pappu.j6w3s)
  const hasTooManyNumbers = numbersCount > 5;
  const isAlphaNumericHash = /^[a-z]+[0-9]+[a-z0-9]+$/.test(localPart) && localPart.length > 8 && numbersCount > 2;
  const hasWeirdDots = localPart.includes('.') && localPart.split('.')[1] && /^[a-z0-9]{4,6}$/.test(localPart.split('.')[1]) && localPart.split('.')[1].match(/[0-9]/);

  if (hasTooManyConsecutiveConsonants || isKeyboardMash || isKnownBotPattern || isBotGeneratorPattern || hasTooManyNumbers || isAlphaNumericHash || hasWeirdDots) {
    return { isValid: false, msg: "This email format appears to be invalid or unsupported." };
  }

  // 5. Live DNS check: MX if present, otherwise A/AAAA (implicit MX)
  const canReceiveMail = await domainCanReceiveMail(emailDomain);
  if (!canReceiveMail) {
    return { isValid: false, msg: "The email domain does not exist or is unreachable. Please use a valid business email." };
  }

  // 6. Global Company Database Verification (The Nuclear Option)
  const isRealCompany = await isDomainInCompanyDatabase(emailDomain);
  if (!isRealCompany) {
    console.log(`[Anti-Bot] Unknown domain detected, flagging for WhatsApp verification: ${emailDomain}`);
    return { 
      isValid: true,
      requiresWhatsApp: true,
      msg: "We could not verify your company domain in our database. Please verify your phone number via WhatsApp to continue." 
    };
  }

  return { isValid: true };
}

module.exports = {
  validateBusinessEmail,
  personalDomains,
  suspiciousTLDs
};