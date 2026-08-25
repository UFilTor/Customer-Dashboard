// Phone-number normalization for the WhatsApp quick action.
//
// HubSpot stores contact phone numbers free-form. A sample of 184 onboarding
// contacts showed two shapes: international ("+46 73 386 75 27", "+4531310777")
// and bare national ("0764494133", "29650141"). WhatsApp's send link needs a
// full international number in digits only, so national numbers have to be
// prefixed with the dialling code of the company's country
// (`understory_company_country`, ISO-2 - see hubspot-enums.ts).
//
// When we cannot establish the country with confidence we return null and the
// caller hides the button. Guessing a dialling code can open a chat with a
// stranger who happens to own that number in another country.

interface DialInfo {
  dial: string;
  /**
   * True when the national format carries a trunk "0" that must be dropped
   * before the country code. Italy is the notable exception: its landline
   * numbers keep the leading 0 when dialled internationally.
   */
  trunkPrefix: boolean;
}

// Every country `understory_company_country` actually holds across the live
// portfolio, which is wider than the seven values COUNTRY_CODES in
// hubspot-enums.ts documents (that list drives Lookup's enum validation and
// is deliberately left alone here). An unlisted country simply means a
// national number stays un-dialable and the button hides.
export const COUNTRY_DIAL_CODES: Record<string, DialInfo> = {
  DK: { dial: "45", trunkPrefix: false },
  SE: { dial: "46", trunkPrefix: true },
  NO: { dial: "47", trunkPrefix: false },
  DE: { dial: "49", trunkPrefix: true },
  IT: { dial: "39", trunkPrefix: false },
  GB: { dial: "44", trunkPrefix: true },
  GL: { dial: "299", trunkPrefix: false },
  FO: { dial: "298", trunkPrefix: false },
  FI: { dial: "358", trunkPrefix: true },
  NL: { dial: "31", trunkPrefix: true },
  FR: { dial: "33", trunkPrefix: true },
  ES: { dial: "34", trunkPrefix: false },
  PL: { dial: "48", trunkPrefix: false },
  GR: { dial: "30", trunkPrefix: false },
  AW: { dial: "297", trunkPrefix: false },
  US: { dial: "1", trunkPrefix: false },
};

/**
 * Digits-only international number for wa.me / api.whatsapp.com, or null when
 * the number cannot be resolved with confidence.
 *
 * @param raw     Contact phone as stored in HubSpot (mobilephone ?? phone).
 * @param country ISO-2 country of the company the contact belongs to.
 */
export function whatsappNumber(
  raw: string | null | undefined,
  country: string | null | undefined
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  // "(0)" is the international notation for a trunk digit that is dialled
  // domestically and dropped from abroad ("+46 (0)70 123 45 67"). Stripping
  // non-digits blind would keep that 0 and hand WhatsApp a number belonging
  // to someone else, which is the one outcome this module exists to avoid.
  const digits = trimmed.replace(/\(\s*0\s*\)/g, "").replace(/\D/g, "");
  if (!digits) return null;

  let intl: string;
  if (trimmed.startsWith("+")) {
    intl = digits;
  } else if (digits.startsWith("00")) {
    // 00 is the international access prefix across all our markets.
    intl = digits.slice(2);
  } else {
    const info = country ? COUNTRY_DIAL_CODES[country.trim().toUpperCase()] : undefined;
    if (!info) return null;
    const national = info.trunkPrefix && digits.startsWith("0") ? digits.slice(1) : digits;
    // TODO(simplification): length heuristic for numbers stored with the
    // country code but no "+" ("46701234567"). Ceiling: a national number
    // that both starts with its own dialling code AND is long enough to look
    // international would be left un-prefixed. Upgrade path is a real E.164
    // parser (libphonenumber-js) if the miss rate ever shows up.
    const looksInternational =
      national.startsWith(info.dial) && national.length >= info.dial.length + 8;
    intl = looksInternational ? national : info.dial + national;
  }

  // E.164 allows 8-15 digits including the country code. Anything shorter is
  // an internal extension or a typo, not a mobile we can message.
  if (intl.length < 8 || intl.length > 15) return null;
  return intl;
}

/**
 * WhatsApp send link with an empty prefilled message, or null when the number
 * cannot be normalized (caller hides the action).
 */
export function whatsappUrl(
  raw: string | null | undefined,
  country: string | null | undefined
): string | null {
  const number = whatsappNumber(raw, country);
  return number ? `https://api.whatsapp.com/send?phone=${number}&text=` : null;
}
