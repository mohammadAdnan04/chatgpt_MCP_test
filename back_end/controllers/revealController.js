const mongoose = require('mongoose');
const User = require('../models/User');
const ListItem = require('../models/ListItem');
const RevealedContact = require('../models/RevealedContact');
const List = require('../models/List');
const { getBalanceForUser, deductCreditsForUser } = require('../utils/wallet');
const revealEvents = require('../utils/revealEvents');
const { isLikelyCorporatePhone, evaluateEmailForBilling, normalizeEmailStatus, leadHasPersonalMobile } = require('../utils/revealBilling');
const { listItemIdentityOr } = require('../utils/leadIdentityQuery');

const PHONE_COST = 20;
const EMAIL_COST = 5;

async function savedLeadHasRevealedForProfile(userId, profileUrl, publicIdentifier, type, excludeLeadId = null) {
  try {
    if (!profileUrl && !publicIdentifier) return false;
    const List = require('../models/List');
    const ListItem = require('../models/ListItem');
    const lists = await List.find({ createdBy: userId }).select('_id').lean();
    const listIds = lists.map(l => l._id);
    if (!listIds.length) return false;
    
    const orConditions = listItemIdentityOr({
      url: profileUrl ? normalizeUrl(profileUrl) : profileUrl,
      publicIdentifier,
    });
    if (!orConditions.length) return false;

    const query = {
      listId: { $in: listIds },
      $or: orConditions
    };
    if (excludeLeadId) {
      query._id = { $ne: excludeLeadId };
    }

    // Use find instead of findOne to check ALL occurrences (e.g. hidden cache vs user list)
    const candidates = await ListItem.find(query).select('email phone raw').lean();
    if (!candidates.length) return false;

    for (const candidate of candidates) {
      if (type === 'email') {
        const isValidEmail = (val) => {
          if (!val) return false;
          const s = String(val).trim().toLowerCase();
          return s && s.includes('@') && !['not available', 'null', 'undefined', 'n/a', 'unknown'].includes(s);
        };
  
        const arr = Array.isArray(candidate?.raw?.contact__all_emails) ? candidate.raw.contact__all_emails : [];
        const hasDeliverable = arr.some(e => {
           const em = e?.email || e?.sanitized_email;
           return isValidEmail(em);
        });
        const topLevel = isValidEmail(candidate.email) || isValidEmail(candidate.raw?.email);
        if (hasDeliverable || topLevel) return true;
      }
      if (type === 'phone') {
        const arr = Array.isArray(candidate?.raw?.contact__phone_numbers) ? candidate.raw.contact__phone_numbers : [];
        const hasAny = arr.some(p => {
          const num = p?.sanitized_number || p?.raw_number;
          return (num && String(num).trim() !== 'Not available');
        });
        const topLevel = (candidate.phone && candidate.phone !== 'Not available') || (candidate.raw?.phone && candidate.raw.phone !== 'Not available');
        if (hasAny || topLevel) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function ensureHiddenCache(userId, profileUrl, publicIdentifier, phone, email, emailStatuses) {
  try {
    const hidden = await List.findOne({ createdBy: userId, name: '__mawsool_hidden_global_cache__' }).lean();
    if (!hidden) return;
    const norm = normalizeUrl(profileUrl);
    const or = [];
    if (publicIdentifier) or.push({ 'raw.public_identifier': publicIdentifier });
    if (norm) {
      or.push({ 'raw.public_profile_url': norm });
      or.push({ 'raw.linkedin_url': norm });
      or.push({ 'raw.profile_url': norm });
    }
    if (!or.length) return;
    let item = await ListItem.findOne({ listId: hidden._id, $or: or });
    if (!item) {
      const raw = {};
      if (publicIdentifier) raw.public_identifier = publicIdentifier;
      if (norm) raw.public_profile_url = norm;
      if (phone) raw.phone = phone;
      if (email) raw.email = email;
      if (email) {
        const arr = [];
        email.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em=>{
          const st = Array.isArray(emailStatuses) && emailStatuses.length ? emailStatuses[0] : '';
          arr.push({ email: em, verificationStatus: st || 'unknown' });
        });
        raw.contact__all_emails = arr;
        raw.email_status = Array.isArray(emailStatuses) && emailStatuses.length ? emailStatuses[0] : raw.email_status;
      }
      if (phone) {
        const arrP = [];
        phone.split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>{
          const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          const num = m ? m[1].trim() : v;
          const type = m ? m[2].trim() : '';
          arrP.push({ sanitized_number: num, raw_number: num, type });
        });
        raw.contact__phone_numbers = arrP;
      }
      await ListItem.create({ listId: hidden._id, raw, email: email || '', phone: phone || '', status: '' });
    } else {
      let modified = false;
      item.raw = item.raw || {};
      if (email) {
        if (!item.raw.email) {
          item.raw.email = email;
          item.email = email;
          modified = true;
        }
        const existing = Array.isArray(item.raw.contact__all_emails) ? item.raw.contact__all_emails : [];
        const merged = [...existing];
        email.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em=>{
          if (!merged.find(x => (x?.email || x?.sanitized_email) === em)) {
            const st = Array.isArray(emailStatuses) && emailStatuses.length ? emailStatuses[0] : 'unknown';
            merged.push({ email: em, verificationStatus: st });
          }
        });
        item.raw.contact__all_emails = merged;
        const stBest = Array.isArray(emailStatuses) && emailStatuses.length ? emailStatuses[0] : '';
        if (stBest) item.raw.email_status = stBest;
        modified = true;
      }
      if (phone) {
        if (!item.raw.phone) {
          item.raw.phone = phone;
          item.phone = phone;
          modified = true;
        }
        const existingP = Array.isArray(item.raw.contact__phone_numbers) ? item.raw.contact__phone_numbers : [];
        const mergedP = [...existingP];
        phone.split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>{
          const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          const num = m ? m[1].trim() : v;
          const type = m ? m[2].trim() : '';
          if (!mergedP.find(x => (x?.sanitized_number || x?.raw_number) === num)) {
            mergedP.push({ sanitized_number: num, raw_number: num, type });
          }
        });
        item.raw.contact__phone_numbers = mergedP;
        modified = true;
      }
      if (modified) {
        item.markModified('raw');
        await item.save();
      }
    }
  } catch {}
}

exports.revealContact = async (req, res, next) => {
  const { leadId, contactType, contactPhone } = req.body;
  const userId = req.user.id || req.user.sub;

  try {
    const finalCost = contactType === 'phone' ? 20 : 5;
    const currentCredits = await getBalanceForUser(userId);
    // --- CHECK 1: See if this reveal already exists ---
    const existingReveal = await RevealedContact.findOne({ userId, leadId, contactType });
    
    if (existingReveal) {
      const lead = await ListItem.findById(leadId).select('email phone phoneNumber raw');
      const contactInfo = contactType === 'phone' ? (lead.raw?.phone || lead.phoneNumber || lead.phone) : lead.email;
      return res.status(200).json({ message: 'Already revealed.', contactInfo });
    }

    // --- CHECK 2: Get the ListItem and its associated List ---
    const leadItem = await ListItem.findById(leadId).populate('listId');
    if (!leadItem || !leadItem.listId) {
      return res.status(404).json({ message: 'Lead or associated list not found.' });
    }
    // Saved leads de-dupe across lists by profile URL
    const candidateUrl = leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url || '';
    if (candidateUrl) {
      const alreadyViaSaved = await savedLeadHasRevealedForProfile(userId, candidateUrl, null, contactType);
      if (alreadyViaSaved) {
        const lead = await ListItem.findById(leadId).select('email phone phoneNumber raw');
        const contactInfo = contactType === 'phone' ? (lead.raw?.phone || lead.phoneNumber || lead.phone) : lead.email;
        return res.status(200).json({ message: 'Already revealed (saved leads).', contactInfo });
      }
    }
    
    const listStatus = leadItem.listId.status;

    let finalCreditsLeft = null;
    let revealStatus = 'charged';

    // Determine if we should charge based on content quality
    let shouldCharge = true;

    if (contactType === 'phone') {
        // Check if provided phone is purely corporate (HQ/Main)
        // If so, we do NOT charge.
        if (contactPhone && typeof contactPhone === 'string' && contactPhone.trim() !== 'Not available') {
            const phoneParts = contactPhone.split(',').map(s => s.trim()).filter(Boolean);
            if (phoneParts.length > 0) {
                const hasPersonal = phoneParts.some(p => !isLikelyCorporatePhone(p));
                if (!hasPersonal) shouldCharge = false;
            }
        }
    }

    if (contactType === 'email') {
       const emailEval = evaluateEmailForBilling(leadItem.raw || {});
       if (emailEval.hasAny && emailEval.hasMissingStatus) {
         const creditsInfo = await getBalanceForUser(userId);
         const visibleCredits = creditsInfo && typeof creditsInfo.balance === 'number' ? creditsInfo.balance : null;
         return res.status(200).json({ message: 'Email verification pending.', contactInfo: 'Not available', creditsLeft: visibleCredits });
       }
       if (emailEval.hasAny && emailEval.allNonBillable) {
         shouldCharge = false;
       }
    }

    if (shouldCharge) {
        const availableCredits = currentCredits.scope === "org" ? (currentCredits.balance + currentCredits.personalCredits) : currentCredits.balance;
        const effectiveCredits = availableCredits - (currentCredits.inFlightCredits || 0);
        if (effectiveCredits < finalCost) {
          return res.status(402).json({ message: 'Insufficient credits. You don\'t have enough credits to reveal this contact. Please upgrade your plan or purchase more credits (some may be reserved by currently running reveals).' });
        }
        const contactName = leadItem.name || leadItem.raw?.name || leadItem.raw?.first_name || leadItem.raw?.last_name || 'Contact';
        const updatedUser = await deductCreditsForUser(userId, finalCost, `Revealed ${contactType} for ${contactName}`);
        finalCreditsLeft = updatedUser.balance;
    } else {
        const user = await User.findById(userId).select('credits');
        finalCreditsLeft = user.credits;
    }

    // --- UPDATE PHONE IN leadItem.raw ---
    let savedPhone = null;
    console.log(contactPhone);
    if (contactPhone) {
      if (typeof contactPhone !== 'string' || contactPhone.trim() === '' || contactPhone === 'Not available') {
        console.warn(`Invalid contactPhone value: ${contactPhone}`);
        return res.status(400).json({ message: 'Invalid phone number provided.' });
      }
      try {
        if (leadItem.raw && typeof leadItem.raw !== 'object') {
          console.warn(`leadItem.raw is not an object: ${leadItem.raw}`);
          leadItem.raw = {};
        }
        leadItem.raw = leadItem.raw || {}; // Initialize raw if undefined
        leadItem.raw.phone = contactPhone.trim(); // Add or update phone (string)
        // Also persist array of phones for multi-value display across reloads
        const existingPhones = Array.isArray(leadItem.raw.contact__phone_numbers) ? leadItem.raw.contact__phone_numbers : [];
        const merged = [...existingPhones];
        contactPhone.split(',').map((s)=>s.trim()).filter(Boolean).forEach((v)=>{
          const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          const num = m ? m[1].trim() : v;
          const type = m ? m[2].trim() : '';
          if (!merged.find((x)=> (x?.sanitized_number || x?.raw_number) === num)) {
            merged.push({ sanitized_number: num, raw_number: num, type });
          }
        });
        leadItem.raw.contact__phone_numbers = merged;
        leadItem.markModified("raw"); 
        await leadItem.save();
        savedPhone = leadItem.raw.phone;
        console.log(`Saved phone to leadItem.raw.phone: ${savedPhone}`);
      } catch (error) {
        console.error("Failed to save phone to leadItem:", error);
        return res.status(500).json({ message: 'Failed to save phone number.', error: error.message });
      }
    } else {
      console.log(`No contactPhone provided for leadId: ${leadId}`);
    }

    // --- CREATE THE REVEAL RECORD ---
    const profileUrlNorm = normalizeUrl(leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url);
    const pubId = leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id;
    await RevealedContact.create({
      userId,
      leadId,
      profileUrl: profileUrlNorm || undefined,
      publicIdentifier: pubId || undefined,
      contactType,
      status: revealStatus, // Save with 'pending' or 'charged' status
    });

    // --- SYNC REVEAL TO OTHER LIST ITEMS WITH SAME PROFILE URL ---
    const profileUrl = normalizeUrl(leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url);
    if (profileUrl) {
      try {
        const List = require('../models/List');
        const userLists = await List.find({ createdBy: userId }).select('_id').lean();
        const userListIds = userLists.map(l => l._id);
        
        // Find other items with same URL in user's lists (excluding current item)
        const otherItems = await ListItem.find({
          listId: { $in: userListIds },
          _id: { $ne: leadId },
          $or: [
            { 'raw.public_profile_url': profileUrl },
            { 'raw.linkedin_url': profileUrl },
            { 'raw.profile_url': profileUrl }
          ]
        });

        for (const item of otherItems) {
          let modified = false;
          // Sync Phone
          if (contactType === 'phone' && savedPhone) {
             item.raw = item.raw || {};
             
             // Merge phone numbers array
             const existingPhones = Array.isArray(item.raw.contact__phone_numbers) ? item.raw.contact__phone_numbers : [];
             const merged = [...existingPhones];
             const newPhones = Array.isArray(leadItem.raw.contact__phone_numbers) ? leadItem.raw.contact__phone_numbers : [];
             
             newPhones.forEach(p => {
                if (!merged.find(x => (x?.sanitized_number || x?.raw_number) === (p.sanitized_number || p.raw_number))) {
                    merged.push(p);
                }
             });
             item.raw.contact__phone_numbers = merged;

             // Only update primary phone if not already present
             if (!item.raw.phone) {
               item.raw.phone = savedPhone;
               item.phone = savedPhone;
             }
             modified = true;
          } 
          // Sync Email (if we had it available in leadItem)
          if (contactType === 'email') {
             // We need the email value. leadItem.email is what we returned.
             const emailVal = leadItem.email || leadItem.raw?.email;
             if (emailVal) {
                item.raw = item.raw || {};
                
                // Merge emails array
                const existingEmails = Array.isArray(item.raw.contact__all_emails) ? item.raw.contact__all_emails : [];
                const mergedEmails = [...existingEmails];
                const newEmails = Array.isArray(leadItem.raw.contact__all_emails) ? leadItem.raw.contact__all_emails : [];
                
                newEmails.forEach(e => {
                    if (!mergedEmails.find(x => (x?.email || x?.sanitized_email) === (e.email || e.sanitized_email))) {
                        mergedEmails.push(e);
                    }
                });
                item.raw.contact__all_emails = mergedEmails;
                
                // --- ADD THIS TO SYNC EMAIL STATUS TO THE DUPLICATE ---
                if (leadItem.raw.contact__email_status) {
                    item.raw.contact__email_status = leadItem.raw.contact__email_status;
                }

                if (!item.raw.email) {
                    item.raw.email = emailVal;
                    item.email = emailVal;
                }
                modified = true;
             }
          }

          if (modified) {
            item.markModified('raw');
            await item.save();
            // Create reveal record for this duplicate so it shows as revealed
            await RevealedContact.updateOne(
              { userId, leadId: item._id, contactType },
              { $setOnInsert: { status: 'charged' } }, // Use 'charged' to indicate paid/valid
              { upsert: true }
            );
          }
        }
      } catch (syncErr) {
        console.error("Error syncing reveal to duplicates:", syncErr);
      }
    }

    // Emit realtime before response
    try {
      const pUrl = profileUrlNorm;
      const types = [contactType];
      if (pUrl && types.length) {
        revealEvents.emit(userId, { 
          profileUrl: pUrl, 
          types, 
          leadIdsAffected: [leadId],
          emails: leadItem.raw?.contact__all_emails || [],
          email_status: leadItem.raw?.email_status || leadItem.raw?.contact__email_status || "",
          phones: leadItem.raw?.contact__phone_numbers || [],
          phone_status: leadItem.raw?.phone_status || "",
          technologies: leadItem.raw?.organization__current_technologies || leadItem.raw?.organization__technologies || leadItem.raw?.technologies || [],
          facebook_url: leadItem.raw?.organization__facebook_url || leadItem.raw?.facebook_url || "",
          twitter_url: leadItem.raw?.organization__twitter_url || leadItem.raw?.twitter_url || "",
          annual_revenue: leadItem.raw?.organization__annual_revenue || leadItem.raw?.annual_revenue || "",
          total_funding: leadItem.raw?.organization__total_funding || leadItem.raw?.total_funding || "",
          latest_funding: leadItem.raw?.organization__latest_funding || leadItem.raw?.latest_funding || "",
          latest_funding_amount: leadItem.raw?.organization__latest_funding_amount || leadItem.raw?.latest_funding_amount || "",
          last_raised_at: leadItem.raw?.organization__last_raised_at || leadItem.raw?.last_raised_at || ""
        });
      }
    } catch {}
    try {
      await ensureHiddenCache(userId, profileUrlNorm, pubId, contactType === 'phone' ? savedPhone : '', contactType === 'email' ? (leadItem.email || leadItem.raw?.email || '') : '', []);
    } catch {}
    res.status(200).json({
      message: 'Contact revealed successfully.',
      contactInfo,
      creditsLeft: finalCreditsLeft,
      savedPhone, // Include saved phone for debugging
    });

  } catch (err) {
    console.error("Error in revealContact:", err);
    next(err);
  }
};

exports.revealBundle = async (req, res, next) => {
  const { leadId, phone, email, types, emailStatuses } = req.body;
  const userId = req.user.id || req.user.sub;

  try {
    const leadItem = await ListItem.findById(leadId).populate('listId');
    if (!leadItem || !leadItem.listId) {
      return res.status(404).json({ message: 'Lead or associated list not found.' });
    }

    const listStatus = leadItem.listId.status;
    const existingPhoneVal = leadItem.raw?.phone || '';
    const existingEmailVal = leadItem.raw?.email || '';

    const hasExistingPhone = !!(existingPhoneVal && String(existingPhoneVal).trim() && String(existingPhoneVal).trim() !== 'Not available');
    const hasExistingEmail = !!(existingEmailVal && String(existingEmailVal).trim() && String(existingEmailVal).trim() !== 'Not available');

    const phoneCandidate = typeof phone === 'string' ? phone.trim() : '';
    const emailCandidate = typeof email === 'string' ? email.trim() : '';
    const phoneValid = !!(phoneCandidate && phoneCandidate !== 'Not available');
    const emailValid = !!(emailCandidate && emailCandidate !== 'Not available');

    // Determine attempted types (like we did in revealBundleSearch)
    const attemptedTypes = Array.isArray(types) ? types : [];
    const attemptedPhone = attemptedTypes.includes('phone') || phoneValid;
    const attemptedEmail = attemptedTypes.includes('email') || emailValid;

    const alreadyPhoneReveal = await RevealedContact.findOne({ userId, leadId, contactType: 'phone' });
    const alreadyEmailReveal = await RevealedContact.findOne({ userId, leadId, contactType: 'email' });

    let chargePhone = false;
    if (phoneValid) {
        // Split and check all numbers. If ANY number is valuable (not corporate), we charge.
        const phoneParts = phoneCandidate.split(',').map(s => s.trim()).filter(Boolean);
        const hasPersonal = phoneParts.some(p => !isLikelyCorporatePhone(p));
        chargePhone = hasPersonal && !hasExistingPhone && !alreadyPhoneReveal;
    }
    let emailEval = null;
    let chargeEmail = false;
    if (emailValid) {
      const emParts = emailCandidate.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
      const emailObjs = emParts.map((em, i) => ({
        email: em,
        verificationStatus: Array.isArray(emailStatuses) ? (emailStatuses[i] || "") : ""
      }));
      emailEval = evaluateEmailForBilling({ contact__all_emails: emailObjs, contact__email: emParts[0], contact__email_status: emailObjs[0]?.verificationStatus });
      if (emailEval.hasAny && emailEval.hasMissingStatus && !emailEval.hasBillable) {
        const user = await User.findById(userId).select('credits');
        const creditsLeft = user?.credits ?? null;
        return res.status(200).json({ message: 'Email verification pending.', pending: true, phone: 'Not available', email: 'Not available', charged: 0, creditsLeft });
      }
      chargeEmail = !!(emailEval.hasBillable && !hasExistingEmail && !alreadyEmailReveal);
    }
    console.log('[revealBundle] leadId=%s userId=%s phoneValid=%s emailValid=%s hasExistingPhone=%s hasExistingEmail=%s alreadyPhoneReveal=%s alreadyEmailReveal=%s', leadId, userId, phoneValid, emailValid, hasExistingPhone, hasExistingEmail, !!alreadyPhoneReveal, !!alreadyEmailReveal);

    // Check if revealed in other lists via Profile URL
    const candidateUrl = leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url;
    if (candidateUrl) {
      if (chargePhone) {
        const alreadyViaSaved = await savedLeadHasRevealedForProfile(userId, candidateUrl, null, 'phone', leadId);
        if (alreadyViaSaved) chargePhone = false;
        console.log('[revealBundle] cross-list phone already revealed=%s url=%s', alreadyViaSaved, candidateUrl);
      }
      if (chargeEmail) {
        const alreadyViaSaved = await savedLeadHasRevealedForProfile(userId, candidateUrl, null, 'email', leadId);
        if (alreadyViaSaved) chargeEmail = false;
        console.log('[revealBundle] cross-list email already revealed=%s url=%s', alreadyViaSaved, candidateUrl);
      }
    }

    // Force charge to FALSE if we are revealing purely Corporate/HQ numbers (and user is not forcing it)
    if (phoneValid && chargePhone) {
        const phoneParts = phone.split(',').map(s => s.trim()).filter(Boolean);
        const hasPersonal = phoneParts.some(p => !isLikelyCorporatePhone(p));
        if (!hasPersonal) chargePhone = false;
    }
    
    if (emailValid && chargeEmail && emailEval && emailEval.allNonBillable) {
      chargeEmail = false;
    }

    const totalCost = (chargePhone ? PHONE_COST : 0) + (chargeEmail ? EMAIL_COST : 0);
    console.log('[revealBundle] chargePhone=%s chargeEmail=%s totalCost=%s', chargePhone, chargeEmail, totalCost);

    let creditsLeft = null;
    let revealStatus = 'charged';
    if (totalCost > 0) {
      const currentCredits = await getBalanceForUser(userId);
      const availableCredits = currentCredits.scope === "org" ? (currentCredits.balance + currentCredits.personalCredits) : currentCredits.balance;
      const effectiveCredits = availableCredits - (currentCredits.inFlightCredits || 0);
      if (effectiveCredits < totalCost) {
        return res.status(402).json({ message: 'Insufficient credits (some may be reserved by currently running reveals).' });
      }
      const contactName = leadItem.name || leadItem.raw?.name || leadItem.raw?.first_name || leadItem.raw?.last_name || 'Contact';
      const typeStr = [chargePhone ? 'phone' : '', chargeEmail ? 'email' : ''].filter(Boolean).join(' and ');
      
      const updatedUser = await deductCreditsForUser(
        userId,
        totalCost,
        `Revealed ${typeStr} for ${contactName}`
      );
      creditsLeft = updatedUser.balance;
      console.log('[revealBundle] credits deducted. creditsLeft=%s', creditsLeft);
    } else {
      const user = await User.findById(userId).select('credits');
      creditsLeft = user.credits;
      console.log('[revealBundle] no deduction. creditsLeft=%s', creditsLeft);
    }

    if (phoneValid && !hasExistingPhone) {
      leadItem.raw = leadItem.raw || {};
      leadItem.raw.phone = phoneCandidate; // persist string
      leadItem.phone = phoneCandidate;
      // Persist array of phones (merge unique)
      const existingPhones = Array.isArray(leadItem.raw.contact__phone_numbers) ? leadItem.raw.contact__phone_numbers : [];
      const merged = [...existingPhones];
      phoneCandidate.split(',').map((s)=>s.trim()).filter(Boolean).forEach((v)=>{
        const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        const num = m ? m[1].trim() : v;
        const type = m ? m[2].trim() : '';
        if (!merged.find((x)=> (x?.sanitized_number || x?.raw_number) === num)) {
          merged.push({ sanitized_number: num, raw_number: num, type });
        }
      });
      leadItem.raw.contact__phone_numbers = merged;
      leadItem.markModified('raw');
    }
    if (emailValid && !hasExistingEmail) {
      leadItem.raw = leadItem.raw || {};
      leadItem.raw.email = emailCandidate;
      leadItem.email = emailCandidate;
      // Persist array of emails (merge unique)
      const existingEmails = Array.isArray(leadItem.raw.contact__all_emails) ? leadItem.raw.contact__all_emails : [];
      const mergedEmails = [...existingEmails];
      const candidates = emailCandidate.split(/[;,]+/).map((s)=>s.trim()).filter(Boolean);
      candidates.forEach((em, i)=>{
        if (!mergedEmails.find((x)=> (x?.email || x?.sanitized_email) === em)) {
          const specificStatus = (Array.isArray(emailStatuses) && emailStatuses[i]) ? emailStatuses[i] : (leadItem.raw.email_status || 'unknown');
          mergedEmails.push({ email: em, verificationStatus: specificStatus });
        }
      });
      leadItem.raw.contact__all_emails = mergedEmails;
      leadItem.markModified('raw');
    }
    if ((phoneValid && !hasExistingPhone) || (emailValid && !hasExistingEmail)) {
      await leadItem.save();

      // --- SYNC BUNDLE REVEAL TO OTHER LIST ITEMS ---
    const profileUrl = normalizeUrl(leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url);
    if (profileUrl) {
      try {
        const List = require('../models/List');
        const userLists = await List.find({ createdBy: userId }).select('_id').lean();
        const userListIds = userLists.map(l => l._id);

        const otherItems = await ListItem.find({
          listId: { $in: userListIds },
          _id: { $ne: leadId },
          $or: [
            { 'raw.public_profile_url': profileUrl },
            { 'raw.linkedin_url': profileUrl },
            { 'raw.profile_url': profileUrl }
          ]
        });

        for (const item of otherItems) {
           let modified = false;
           if (phoneValid) {
             const existingPhones = Array.isArray(item.raw.contact__phone_numbers) ? item.raw.contact__phone_numbers : [];
             const merged = [...existingPhones];
             phoneCandidate.split(',').map((s)=>s.trim()).filter(Boolean).forEach((v)=>{
               const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
               const num = m ? m[1].trim() : v;
               const type = m ? m[2].trim() : '';
               if (!merged.find((x)=> (x?.sanitized_number || x?.raw_number) === num)) {
                 merged.push({ sanitized_number: num, raw_number: num, type });
               }
             });
             item.raw.contact__phone_numbers = merged;
             
             if (!item.raw.phone) {
               item.raw.phone = leadItem.raw.phone;
               item.phone = leadItem.raw.phone;
             }
             
             // --- NEW: Sync Firmographics (also for phone reveals) ---
             item.raw.organization__technologies = leadItem.raw.organization__technologies || item.raw.organization__technologies;
             item.raw.technologies = leadItem.raw.technologies || item.raw.technologies;
             item.raw.organization__facebook_url = leadItem.raw.organization__facebook_url || item.raw.organization__facebook_url;
             item.raw.facebook_url = leadItem.raw.facebook_url || item.raw.facebook_url;
             item.raw.organization__twitter_url = leadItem.raw.organization__twitter_url || item.raw.organization__twitter_url;
             item.raw.twitter_url = leadItem.raw.twitter_url || item.raw.twitter_url;
             item.raw.organization__annual_revenue = leadItem.raw.organization__annual_revenue || item.raw.organization__annual_revenue;
             item.raw.annual_revenue = leadItem.raw.annual_revenue || item.raw.annual_revenue;
             item.raw.organization__total_funding = leadItem.raw.organization__total_funding || item.raw.organization__total_funding;
             item.raw.total_funding = leadItem.raw.total_funding || item.raw.total_funding;
             item.raw.organization__latest_funding = leadItem.raw.organization__latest_funding || item.raw.organization__latest_funding;
             item.raw.latest_funding = leadItem.raw.latest_funding || item.raw.latest_funding;
             item.raw.organization__latest_funding_amount = leadItem.raw.organization__latest_funding_amount || item.raw.organization__latest_funding_amount;
             item.raw.latest_funding_amount = leadItem.raw.latest_funding_amount || item.raw.latest_funding_amount;
             item.raw.organization__last_raised_at = leadItem.raw.organization__last_raised_at || item.raw.organization__last_raised_at;
             item.raw.last_raised_at = leadItem.raw.last_raised_at || item.raw.last_raised_at;
             // -------------------------------

             modified = true;
             
             // Mark as revealed
             await RevealedContact.updateOne(
               { userId, leadId: item._id, contactType: 'phone' },
               { $setOnInsert: { status: 'charged' }, $set: { publicIdentifier: item.raw?.public_identifier || item.raw?.id || item.raw?.person_id } },
               { upsert: true }
             );
           }
           if (emailValid) {
             const existingEmails = Array.isArray(item.raw.contact__all_emails) ? item.raw.contact__all_emails : [];
             const mergedEmails = [...existingEmails];
             const candidates = emailCandidate.split(/[;,]+/).map((s)=>s.trim()).filter(Boolean);
             candidates.forEach((em, i)=>{
               if (!mergedEmails.find((x)=> (x?.email || x?.sanitized_email) === em)) {
                 const specificStatus = (Array.isArray(emailStatuses) && emailStatuses[i]) ? emailStatuses[i] : (leadItem.raw.email_status || 'unknown');
                 mergedEmails.push({ email: em, verificationStatus: specificStatus });
               }
             });
             item.raw.contact__all_emails = mergedEmails;

             // Sync top-level status
             if (leadItem.raw.contact__email_status) {
                 item.raw.contact__email_status = leadItem.raw.contact__email_status;
             }

             if (!item.raw.email) {
               item.raw.email = leadItem.raw.email;
               item.email = leadItem.raw.email;
             }
             
             // --- NEW: Sync Firmographics ---
             item.raw.organization__technologies = leadItem.raw.organization__technologies || item.raw.organization__technologies;
             item.raw.technologies = leadItem.raw.technologies || item.raw.technologies;
             item.raw.organization__facebook_url = leadItem.raw.organization__facebook_url || item.raw.organization__facebook_url;
             item.raw.facebook_url = leadItem.raw.facebook_url || item.raw.facebook_url;
             item.raw.organization__twitter_url = leadItem.raw.organization__twitter_url || item.raw.organization__twitter_url;
             item.raw.twitter_url = leadItem.raw.twitter_url || item.raw.twitter_url;
             item.raw.organization__annual_revenue = leadItem.raw.organization__annual_revenue || item.raw.organization__annual_revenue;
             item.raw.annual_revenue = leadItem.raw.annual_revenue || item.raw.annual_revenue;
             item.raw.organization__total_funding = leadItem.raw.organization__total_funding || item.raw.organization__total_funding;
             item.raw.total_funding = leadItem.raw.total_funding || item.raw.total_funding;
             item.raw.organization__latest_funding = leadItem.raw.organization__latest_funding || item.raw.organization__latest_funding;
             item.raw.latest_funding = leadItem.raw.latest_funding || item.raw.latest_funding;
             item.raw.organization__latest_funding_amount = leadItem.raw.organization__latest_funding_amount || item.raw.organization__latest_funding_amount;
             item.raw.latest_funding_amount = leadItem.raw.latest_funding_amount || item.raw.latest_funding_amount;
             item.raw.organization__last_raised_at = leadItem.raw.organization__last_raised_at || item.raw.organization__last_raised_at;
             item.raw.last_raised_at = leadItem.raw.last_raised_at || item.raw.last_raised_at;
             // -------------------------------
             
             modified = true;
             
             // Mark as revealed
             await RevealedContact.updateOne(
               { userId, leadId: item._id, contactType: 'email' },
               { $setOnInsert: { status: 'charged' }, $set: { publicIdentifier: item.raw?.public_identifier || item.raw?.id || item.raw?.person_id } },
               { upsert: true }
             );
           }
           if (modified) {
             item.markModified('raw');
             await item.save();
           }
        }
      } catch (syncErr) {
        console.error("Error syncing bundle reveal to duplicates:", syncErr);
      }
    }
    }

    const profileUrlNorm2 = normalizeUrl(leadItem.raw?.public_profile_url || leadItem.raw?.linkedin_url || leadItem.raw?.profile_url);
    if (profileUrlNorm2) {
      if (attemptedPhone) {
        const status = chargePhone ? 'charged' : 'free';
        await RevealedContact.updateOne(
          { userId, profileUrl: profileUrlNorm2, contactType: 'phone' },
          { $setOnInsert: { status }, $set: { leadId, publicIdentifier: leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id } },
          { upsert: true }
        );
      }
      if (attemptedEmail) {
        const status = (chargeEmail || emailValid) ? 'charged' : 'free';
        await RevealedContact.updateOne(
          { userId, profileUrl: profileUrlNorm2, contactType: 'email' },
          { $setOnInsert: { status }, $set: { leadId, publicIdentifier: leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id } },
          { upsert: true }
        );
      }
    } else {
        // Fallback for ID-only reveals if no profile URL
        if (attemptedPhone) {
             const status = chargePhone ? 'charged' : 'free';
             await RevealedContact.updateOne(
              { userId, leadId, contactType: 'phone' },
              { $setOnInsert: { status }, $set: { publicIdentifier: leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id } },
              { upsert: true }
            );
        }
        if (attemptedEmail) {
            const status = (chargeEmail || emailValid) ? 'charged' : 'free';
             await RevealedContact.updateOne(
              { userId, leadId, contactType: 'email' },
              { $setOnInsert: { status }, $set: { publicIdentifier: leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id } },
              { upsert: true }
            );
        }
    }

    const finalPhone = leadItem.raw?.phone || '';
    const finalEmail = leadItem.raw?.email || '';

    // Emit realtime before response (reflect current presence of phone/email)
    try {
      const pUrl = profileUrlNorm2;
      const types = [];
      if (String(finalPhone || '').trim()) types.push('phone');
      if (String(finalEmail || '').trim()) types.push('email');
      if (pUrl && types.length) {
        revealEvents.emit(userId, { 
          profileUrl: pUrl, 
          types, 
          leadIdsAffected: [leadId],
          emails: leadItem.raw?.contact__all_emails || [],
          email_status: leadItem.raw?.email_status || leadItem.raw?.contact__email_status || "",
          phones: leadItem.raw?.contact__phone_numbers || [],
          phone_status: leadItem.raw?.phone_status || "",
          technologies: leadItem.raw?.organization__current_technologies || leadItem.raw?.organization__technologies || leadItem.raw?.technologies || [],
          facebook_url: leadItem.raw?.organization__facebook_url || leadItem.raw?.facebook_url || "",
          twitter_url: leadItem.raw?.organization__twitter_url || leadItem.raw?.twitter_url || "",
          annual_revenue: leadItem.raw?.organization__annual_revenue || leadItem.raw?.annual_revenue || "",
          total_funding: leadItem.raw?.organization__total_funding || leadItem.raw?.total_funding || "",
          latest_funding: leadItem.raw?.organization__latest_funding || leadItem.raw?.latest_funding || "",
          latest_funding_amount: leadItem.raw?.organization__latest_funding_amount || leadItem.raw?.latest_funding_amount || "",
          last_raised_at: leadItem.raw?.organization__last_raised_at || leadItem.raw?.last_raised_at || ""
        });
      }
    } catch {}
    try {
      await ensureHiddenCache(userId, profileUrlNorm2, leadItem.raw?.public_identifier || leadItem.raw?.id || leadItem.raw?.person_id, phoneValid ? phoneCandidate : '', emailValid ? emailCandidate : '', []);
    } catch {}
    return res.status(200).json({
      message: 'Contacts revealed successfully.',
      phone: finalPhone,
      email: finalEmail,
      charged: totalCost,
      creditsLeft,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reveal/list/:listId/revealed-contacts
exports.getRevealedContactsForList = async (req, res, next) => {
  const { listId } = req.params;
    const userId = req.user.sub || req.user.id || req.user._id; 


  try {
    // 1. Input Validation
    if (!mongoose.Types.ObjectId.isValid(listId)) {
      return res.status(400).json({ message: 'Invalid List ID format.' });
    }

    // 2. Verify ownership before returning list-level reveal information.
    const list = await List.findOne({ _id: listId, createdBy: userId }).select('_id').lean();
    if (!list) {
      return res.status(404).json({ message: 'List not found or access denied.' });
    }

    const leadsInList = await ListItem.find({ listId }).select('_id phone raw').lean();
    
    if (leadsInList.length === 0) {
      return res.status(200).json({ contacts: {} });
    }

    // 3. Extract lead IDs
    const leadIds = leadsInList.map(lead => lead._id);

    // 4. Find revealed contacts for this user and these leads
    const revealedRecords = await RevealedContact.find({
      userId: userId,
      leadId: { $in: leadIds }
    }).select('leadId contactType').lean();

    const leadById = new Map(leadsInList.map((lead) => [String(lead._id), lead]));

    // 5. Transform data for frontend. HQ/landline-only leads are not "phone revealed".
    const revealedMap = revealedRecords.reduce((map, record) => {
      const leadIdStr = record.leadId.toString();
      if (record.contactType === 'phone' && !leadHasPersonalMobile(leadById.get(leadIdStr))) {
        return map;
      }
      if (!map[leadIdStr]) {
        map[leadIdStr] = [];
      }
      map[leadIdStr].push(record.contactType);
      return map;
    }, {});

    res.status(200).json({ contacts: revealedMap });

  } catch (err) {
    console.error('Error in getRevealedContactsForList:', err);
    next(err);
  }
};

// GET /api/reveal/user/history
exports.getUserRevealHistory = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const revealHistory = await RevealedContact.find({ userId })
      .populate({
        path: 'leadId',
        select: 'name company title email phoneNumber',
        populate: {
          path: 'listId',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await RevealedContact.countDocuments({ userId });

    const formattedHistory = revealHistory.map(reveal => ({
      revealId: reveal._id,
      contactType: reveal.contactType,
      revealedAt: reveal.createdAt,
      lead: {
        name: reveal.leadId?.name || 'Unknown',
        company: reveal.leadId?.company || 'Unknown',
        title: reveal.leadId?.title || 'Unknown'
      },
      listName: reveal.leadId?.listId?.name || 'Unknown List',
      contactInfo: reveal.contactType === 'phone' 
        ? reveal.leadId?.phoneNumber 
        : reveal.leadId?.email
    }));

    res.status(200).json({
      history: formattedHistory,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });

  } catch (err) {
    console.error('Error in getUserRevealHistory:', err);
    next(err);
  }
};

// GET /api/reveal/stats
exports.getRevealStats = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    
    const stats = await RevealedContact.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$contactType',
          count: { $sum: 1 },
          totalCost: {
            $sum: {
              $cond: {
                if: { $eq: ['$contactType', 'phone'] },
                then: PHONE_COST,
                else: EMAIL_COST
              }
            }
          }
        }
      }
    ]);

    const formattedStats = {
      totalReveals: 0,
      totalSpent: 0,
      phoneReveals: 0,
      emailReveals: 0,
      phoneSpent: 0,
      emailSpent: 0
    };

    stats.forEach(stat => {
      formattedStats.totalReveals += stat.count;
      formattedStats.totalSpent += stat.totalCost;
      
      if (stat._id === 'phone') {
        formattedStats.phoneReveals = stat.count;
        formattedStats.phoneSpent = stat.totalCost;
      } else {
        formattedStats.emailReveals = stat.count;
        formattedStats.emailSpent = stat.totalCost;
      }
    });

    res.status(200).json(formattedStats);

  } catch (err) {
    console.error('Error in getRevealStats:', err);
    next(err);
  }
};

exports.revealBundleSearch = async (req, res, next) => {
  const { phone, email, emailStatuses, profileUrl, publicIdentifier, types } = req.body;
  const userId = req.user.id || req.user.sub;
  try {
    const phoneValid = typeof phone === 'string' && phone.trim() && phone.trim() !== 'Not available';
    const emailValid = typeof email === 'string' && email.trim() && email.trim() !== 'Not available';
    const normUrl = normalizeUrl(profileUrl);

    // Determine what was ATTEMPTED based on 'types' array or fallback to valid values
    const attemptedTypes = Array.isArray(types) ? types : [];
    const attemptedPhone = attemptedTypes.includes('phone') || phoneValid;
    const attemptedEmail = attemptedTypes.includes('email') || emailValid;

    let chargePhone = false;
    if (phoneValid) {
        // Split and check all numbers. If ANY number is valuable (not corporate), we charge.
        const phoneParts = phone.split(',').map(s => s.trim()).filter(Boolean);
        const hasPersonal = phoneParts.some(p => !isLikelyCorporatePhone(p));
        // If hasPersonal is true, we charge.
        // If hasPersonal is false (all are corporate), we don't charge.
        chargePhone = hasPersonal;
    }
    
    let chargeEmail = !!emailValid;
    let emailEval = null;
    if (emailValid) {
      const parts = String(email || '').split(/[;,]+/).map(s => s.trim()).filter(Boolean);
      const objs = parts.map((em, i) => ({ email: em, verificationStatus: Array.isArray(emailStatuses) ? (emailStatuses[i] || "") : "" }));
      emailEval = evaluateEmailForBilling({ contact__all_emails: objs, contact__email: parts[0], contact__email_status: objs[0]?.verificationStatus });
      if (emailEval.hasAny && emailEval.hasMissingStatus && !emailEval.hasBillable) {
        const user = await User.findById(userId).select('credits');
        const creditsLeft = user?.credits ?? null;
        return res.status(200).json({ message: 'Email verification pending.', pending: true, charged: 0, creditsLeft });
      }
      chargeEmail = !!emailEval.hasBillable;
      if (emailEval.allNonBillable) chargeEmail = false;
    }
    
    // Check by ID first if available
    if (publicIdentifier) {
      const alreadyPhoneReveal = await RevealedContact.findOne({ userId, publicIdentifier, contactType: 'phone' });
      const alreadyEmailReveal = await RevealedContact.findOne({ userId, publicIdentifier, contactType: 'email' });
      if (alreadyPhoneReveal) chargePhone = false;
      if (alreadyEmailReveal) chargeEmail = false;
    }

    if (normUrl) {
      const alreadyPhoneReveal = await RevealedContact.findOne({ userId, profileUrl: normUrl, contactType: 'phone' });
      const alreadyEmailReveal = await RevealedContact.findOne({ userId, profileUrl: normUrl, contactType: 'email' });
      if (alreadyPhoneReveal) chargePhone = false;
      if (alreadyEmailReveal) chargeEmail = false;
      // Saved leads-based de-dupe
      if (chargePhone) {
        const savedHasPhone = await savedLeadHasRevealedForProfile(userId, normUrl, publicIdentifier, 'phone');
        if (savedHasPhone) chargePhone = false;
      }
      if (chargeEmail) {
        const savedHasEmail = await savedLeadHasRevealedForProfile(userId, normUrl, publicIdentifier, 'email');
        if (savedHasEmail) chargeEmail = false;
      }
    }

    const totalCost = (chargePhone ? PHONE_COST : 0) + (chargeEmail ? EMAIL_COST : 0);

    let creditsLeft;
    if (totalCost > 0) {
      const currentCredits = await getBalanceForUser(userId);
      const availableCredits = currentCredits.scope === "org" ? (currentCredits.balance + currentCredits.personalCredits) : currentCredits.balance;
      const effectiveCredits = availableCredits - (currentCredits.inFlightCredits || 0);
      if (effectiveCredits < totalCost) {
        return res.status(402).json({ message: 'Insufficient credits (some may be reserved by currently running reveals).' });
      }
      const typeStr = [chargePhone ? 'phone' : '', chargeEmail ? 'email' : ''].filter(Boolean).join(' and ');
      const contactName = req.body.publicIdentifier || req.body.profileUrl || 'Contact';
      const updatedUser = await deductCreditsForUser(userId, totalCost, `Revealed ${typeStr} for ${contactName}`);
      creditsLeft = updatedUser.balance;
    } else {
      const user = await User.findById(userId).select('credits');
      creditsLeft = user.credits;
    }

    if (normUrl || publicIdentifier) {
      const upsertRevealMarker = async (contactType, status) => {
        // Prefer profileUrl as the stable key for search reveals (no list leadId).
        const q = { userId, contactType };
        if (normUrl) q.profileUrl = normUrl;
        else if (publicIdentifier) q.publicIdentifier = publicIdentifier;

        const $set = {};
        if (publicIdentifier) $set.publicIdentifier = publicIdentifier;
        if (normUrl) $set.profileUrl = normUrl;

        try {
          await RevealedContact.updateOne(
            q,
            { $setOnInsert: { status }, $set, $unset: { leadId: 1 } },
            { upsert: true }
          );
        } catch (dupErr) {
          // Legacy unique index on (userId, leadId:null, contactType) can race; marker is best-effort.
          if (dupErr && (dupErr.code === 11000 || dupErr.codeName === 'DuplicateKey')) {
            console.warn('[revealBundleSearch] RevealedContact dup ignored:', dupErr.message);
            return;
          }
          throw dupErr;
        }
      };

      if (attemptedPhone && phoneValid) {
        await upsertRevealMarker('phone', chargePhone ? 'charged' : 'free');
      }
      if (attemptedEmail && emailValid) {
        await upsertRevealMarker('email', chargeEmail ? 'charged' : 'free');
      }
    }

    // Emit realtime before response
    try {
      const types = [];
      if (chargePhone) types.push('phone');
      if (chargeEmail) types.push('email');
      if (normUrl && types.length) revealEvents.emit(userId, { profileUrl: normUrl, types, leadIdsAffected: [] });
    } catch {}
    return res.status(200).json({
      message: 'Contacts revealed successfully.',
      charged: totalCost,
      creditsLeft,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reveal/check?profileUrl=...&types=email,phone&publicIdentifier=...
exports.checkReveal = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.sub || req.user._id;
    const profileUrl = normalizeUrl(req.query.profileUrl);
    const publicIdentifier = req.query.publicIdentifier;
    const typesRaw = String(req.query.types || '').toLowerCase();
    const types = typesRaw ? typesRaw.split(',').map(t => t.trim()).filter(t => t === 'phone' || t === 'email') : ['phone','email'];
    if (!profileUrl && !publicIdentifier) return res.status(400).json({ message: 'Missing profileUrl or publicIdentifier' });
    
    const query = { userId, contactType: { $in: types } };
    if (publicIdentifier && profileUrl) {
      query.$or = [{ publicIdentifier }, { profileUrl }];
    } else if (publicIdentifier) {
      query.publicIdentifier = publicIdentifier;
    } else {
      query.profileUrl = profileUrl;
    }

    const rows = await RevealedContact.find(query).select('contactType').lean();
    const set = new Set(rows.map(r => r.contactType));
    // Billing still de-dupes via savedLeadHasRevealedForProfile. Checking every
    // search row against all of the user's lists (regex URL scans) made the
    // table freeze after each search. RevealedContact is enough for the UI.
    const revealed = Array.from(set);
    return res.status(200).json({ profileUrl, revealed });
  } catch (err) {
    next(err);
  }
};

// GET /api/reveal/values?profileUrl=...&publicIdentifier=...
exports.getRevealValues = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.sub || req.user._id;
    const profileUrl = normalizeUrl(req.query.profileUrl);
    const publicIdentifier = req.query.publicIdentifier;
    if (!profileUrl && !publicIdentifier) return res.status(400).json({ message: 'Missing profileUrl or publicIdentifier' });

    const List = require('../models/List');
    const lists = await List.find({ createdBy: userId }).select('_id').lean();
    const listIds = lists.map(l => l._id);
    
    const ListItem = require('../models/ListItem');
    const orConditions = listItemIdentityOr({ url: profileUrl, publicIdentifier });

    const candidates = (!listIds.length || !orConditions.length) ? [] : await ListItem.find({
      listId: { $in: listIds },
      $or: orConditions
    }).select('raw email phone phoneNumber').lean();

    const emailMap = new Map();
    const phoneMap = new Map();
    
    // Firmographic accumulators
    let bestTechnologies = [];
    let bestFacebook = "";
    let bestTwitter = "";
    let bestAnnualRevenue = "";
    let bestTotalFunding = "";
    let bestLatestFunding = "";
    let bestLatestFundingAmount = "";
    let bestLastRaisedAt = "";

    for (const candidate of candidates) {
        const raw = candidate.raw || {};
        const emailsArray = Array.isArray(raw.contact__all_emails) ? raw.contact__all_emails : [];
        const phonesArray = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
        const primaryEmail = candidate.email || raw.email || '';
        const primaryPhone = candidate.phoneNumber || raw.phone || '';

        // Capture firmographics (take the first truthy value we find across candidates)
        if (!bestTechnologies.length) {
            bestTechnologies = raw.organization__current_technologies || raw.organization__technologies || raw.technologies || [];
        }
        if (!bestFacebook) bestFacebook = raw.organization__facebook_url || raw.facebook_url || "";
        if (!bestTwitter) bestTwitter = raw.organization__twitter_url || raw.twitter_url || "";
        if (!bestAnnualRevenue) bestAnnualRevenue = raw.organization__annual_revenue || raw.annual_revenue || "";
        if (!bestTotalFunding) bestTotalFunding = raw.organization__total_funding || raw.total_funding || "";
        if (!bestLatestFunding) bestLatestFunding = raw.organization__latest_funding || raw.latest_funding || "";
        if (!bestLatestFundingAmount) bestLatestFundingAmount = raw.organization__latest_funding_amount || raw.latest_funding_amount || "";
        if (!bestLastRaisedAt) bestLastRaisedAt = raw.organization__last_raised_at || raw.last_raised_at || "";

        // Add primary
        if (primaryEmail && String(primaryEmail).toLowerCase() !== 'not available') {
            const k = String(primaryEmail).toLowerCase();
            if (!emailMap.has(k)) emailMap.set(k, { email: primaryEmail, verificationStatus: raw.email_status || 'unknown' });
        }
        if (primaryPhone && String(primaryPhone).toLowerCase() !== 'not available') {
            const k = String(primaryPhone).replace(/[^+\d]/g,'');
            if (k && !phoneMap.has(k)) phoneMap.set(k, { sanitized_number: primaryPhone, raw_number: primaryPhone, type: '' });
        }

        // Add arrays
        for (const e of emailsArray) {
            const em = e?.email || e?.sanitized_email;
            if (em && String(em).toLowerCase() !== 'not available') {
                const k = String(em).toLowerCase();
                const existing = emailMap.get(k);
                
                // If we have a new entry with better status, use it
                const newStatus = e.verificationStatus || e.status || '';
                const oldStatus = existing?.verificationStatus || existing?.status || '';
                
                if (!existing || (newStatus && !oldStatus)) {
                    emailMap.set(k, e);
                }
            }
        }
        for (const p of phonesArray) {
            const num = p?.sanitized_number || p?.raw_number;
            if (num) {
                 const k = String(num).replace(/[^+\d]/g,'');
                 if (k && !phoneMap.has(k)) phoneMap.set(k, p);
            }
        }
    }

    if (!emailMap.size && !phoneMap.size && (profileUrl || publicIdentifier)) {
      try {
        const axios = require("axios");
        const linkedinUrl = profileUrl || (publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : "");
        const middlewareUrl = process.env.MIDDLEWARE_URL || process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
        const hyd = await axios.get(`${middlewareUrl}/api/contact/hydrate`, {
          params: { url: linkedinUrl },
          headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "secret123" },
          timeout: 8000,
          validateStatus: () => true
        });
        const raw = hyd.status === 200 ? hyd.data : null;
        if (raw && typeof raw === "object") {
          const emailsArray = Array.isArray(raw.contact__all_emails) ? raw.contact__all_emails : (Array.isArray(raw.contact__emails) ? raw.contact__emails : (Array.isArray(raw.emails) ? raw.emails : []));
          const phonesArray = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : (Array.isArray(raw.phones) ? raw.phones : []);
          for (const e of emailsArray) {
            const em = typeof e === "string" ? e : (e?.email || e?.sanitized_email);
            if (em && String(em).toLowerCase() !== "not available") {
              const k = String(em).toLowerCase();
              if (!emailMap.has(k)) emailMap.set(k, typeof e === "object" ? e : { email: em });
            }
          }
          if (raw.email && String(raw.email).includes("@") && !emailMap.has(String(raw.email).toLowerCase())) {
            emailMap.set(String(raw.email).toLowerCase(), { email: raw.email });
          }
          for (const p of phonesArray) {
            const num = typeof p === "string" ? p : (p?.sanitized_number || p?.raw_number || p?.number);
            if (num && String(num).toLowerCase() !== "not available") {
              const k = String(num).replace(/[^+\d]/g, "");
              if (k && !phoneMap.has(k)) phoneMap.set(k, typeof p === "object" ? p : { sanitized_number: num, raw_number: num });
            }
          }
        }
      } catch (err) {
        console.warn("[getRevealValues] cache hydrate failed:", err.message);
      }
    }
    
    return res.status(200).json({ 
        emails: Array.from(emailMap.values()), 
        phones: Array.from(phoneMap.values()),
        technologies: bestTechnologies,
        facebook_url: bestFacebook,
        twitter_url: bestTwitter,
        annual_revenue: bestAnnualRevenue,
        total_funding: bestTotalFunding,
        latest_funding: bestLatestFunding,
        latest_funding_amount: bestLatestFundingAmount,
        last_raised_at: bestLastRaisedAt
    });
  } catch (err) {
    next(err);
  }
};

function normalizeUrl(u) {
  try {
    if (!u) return "";
    const url = new URL(String(u).trim());
    url.hash = "";
    url.search = "";
    const host = url.hostname.toLowerCase();
    const proto = url.protocol.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/,"/");
    return `${proto}//${host}${path}`;
  } catch {
    return String(u || "").trim().toLowerCase();
  }
}
