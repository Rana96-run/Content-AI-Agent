/**
 * Timing Context — auto-detects Saudi-relevant calendar events and injects them
 * into every generate call so agents never write "timeless" copy during Ramadan,
 * Eid, ZATCA filing windows, or national occasions.
 *
 * Two detection windows:
 *   - Religious / national: ±21 days from today
 *   - ZATCA VAT filing deadlines: 45 days ahead (copy prep takes time)
 *
 * No external deps, no async — pure date math on a static list.
 */

interface Occasion {
  name_ar: string;
  start: string;  // YYYY-MM-DD
  end: string;    // YYYY-MM-DD (inclusive)
  type: "national" | "religious" | "zatca";
  tone_ar: string; // what this means for copy
}

// ── Fixed Gregorian occasions (repeat every year) ─────────────────────────────
// Founding Day: Feb 22, National Day: Sep 23
function fixedAnnualOccasion(month: number, day: number, name_ar: string, tone_ar: string, type: Occasion["type"]): Occasion[] {
  const years = [2025, 2026, 2027, 2028];
  return years.map(y => {
    const d = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { name_ar, start: d, end: d, type, tone_ar };
  });
}

// ── Hijri occasions (hardcoded through 2027) ───────────────────────────────────
// Approximate Gregorian dates for the Hijri calendar. Update after 2027.
const HIJRI_OCCASIONS: Occasion[] = [
  // Ramadan 2025: Mar 1 – Mar 29
  { name_ar: "شهر رمضان 2025", start: "2025-03-01", end: "2025-03-29", type: "religious",
    tone_ar: "ساعات دوام معدّلة، إنفاق مرتفع على التجزئة، نبرة روحانية مناسبة" },
  // Eid al-Fitr 2025: Mar 30 – Apr 2
  { name_ar: "إجازة عيد الفطر 2025", start: "2025-03-30", end: "2025-04-02", type: "religious",
    tone_ar: "توقف شبه كامل — رسائل تهنئة فقط، لا عروض مبيعات" },
  // Eid al-Adha 2025: Jun 7 – Jun 10
  { name_ar: "إجازة عيد الأضحى 2025", start: "2025-06-07", end: "2025-06-10", type: "religious",
    tone_ar: "توقف تجاري — محتوى تهنئة فقط" },
  // Ramadan 2026: Mar 1 – Mar 29
  { name_ar: "شهر رمضان 2026", start: "2026-03-01", end: "2026-03-29", type: "religious",
    tone_ar: "ساعات دوام معدّلة، إنفاق مرتفع على التجزئة، نبرة روحانية مناسبة" },
  // Eid al-Fitr 2026: Mar 30 – Apr 2
  { name_ar: "إجازة عيد الفطر 2026", start: "2026-03-30", end: "2026-04-02", type: "religious",
    tone_ar: "توقف شبه كامل — رسائل تهنئة فقط، لا عروض مبيعات" },
  // Eid al-Adha 2026: Jun 6 – Jun 9
  { name_ar: "إجازة عيد الأضحى 2026", start: "2026-06-06", end: "2026-06-09", type: "religious",
    tone_ar: "توقف تجاري — محتوى تهنئة فقط" },
  // Ramadan 2027: Feb 18 – Mar 18
  { name_ar: "شهر رمضان 2027", start: "2027-02-18", end: "2027-03-18", type: "religious",
    tone_ar: "ساعات دوام معدّلة، إنفاق مرتفع على التجزئة، نبرة روحانية مناسبة" },
  // Eid al-Fitr 2027: Mar 19 – Mar 22
  { name_ar: "إجازة عيد الفطر 2027", start: "2027-03-19", end: "2027-03-22", type: "religious",
    tone_ar: "توقف شبه كامل — رسائل تهنئة فقط، لا عروض مبيعات" },
  // Eid al-Adha 2027: May 27 – May 30
  { name_ar: "إجازة عيد الأضحى 2027", start: "2027-05-27", end: "2027-05-30", type: "religious",
    tone_ar: "توقف تجاري — محتوى تهنئة فقط" },
];

// ── ZATCA VAT filing windows (computed quarterly) ─────────────────────────────
// Deadline: last day of month following each quarter end
// Q1 (Jan–Mar) → Apr 30 | Q2 (Apr–Jun) → Jul 31 | Q3 (Jul–Sep) → Oct 31 | Q4 (Oct–Dec) → Jan 31
function getZatcaDeadlines(): Occasion[] {
  const year = new Date().getFullYear();
  const deadlines = [
    { name_ar: "موعد تقديم ضريبة القيمة المضافة — الربع الأول", date: `${year}-04-30` },
    { name_ar: "موعد تقديم ضريبة القيمة المضافة — الربع الثاني", date: `${year}-07-31` },
    { name_ar: "موعد تقديم ضريبة القيمة المضافة — الربع الثالث", date: `${year}-10-31` },
    { name_ar: "موعد تقديم ضريبة القيمة المضافة — الربع الرابع", date: `${year + 1}-01-31` },
    // next year's Q1 deadline
    { name_ar: "موعد تقديم ضريبة القيمة المضافة — الربع الأول", date: `${year + 1}-04-30` },
  ];
  return deadlines.map(d => ({
    ...d,
    start: d.date,
    end: d.date,
    type: "zatca" as const,
    tone_ar: "فرصة ZATCA — ذكّر أن قيود يصدر فواتير معتمدة تلقائياً قبل الموعد",
  }));
}

// ── Build the full list on first call ────────────────────────────────────────
function getAllOccasions(): Occasion[] {
  return [
    ...fixedAnnualOccasion(2, 22, "يوم التأسيس السعودي", "وطني — فرصة لإبراز جذور قيود السعودية", "national"),
    ...fixedAnnualOccasion(9, 23, "اليوم الوطني السعودي", "وطني — أبرز أن قيود سعودي 100% من الألف إلى الياء", "national"),
    ...HIJRI_OCCASIONS,
    ...getZatcaDeadlines(),
  ];
}

export function getTimingContextSnippet(): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const near21 = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const near45 = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const relevant = getAllOccasions().filter(o => {
    const isActive   = o.start <= todayStr && o.end >= todayStr;
    const isNear     = o.start > todayStr && o.start <= near21;
    const isZatcaNear = o.type === "zatca" && o.start > todayStr && o.start <= near45;
    return isActive || isNear || isZatcaNear;
  });

  if (relevant.length === 0) return "";

  const lines = relevant.map(o => {
    const isActive = o.start <= todayStr && o.end >= todayStr;
    const label = isActive ? "نشط الآن" : `قادم ${o.start}`;
    return `• ${o.name_ar} (${label}) — ${o.tone_ar}`;
  });

  return `\n## السياق الزمني (${todayStr}):\n${lines.join("\n")}\n← راعِ هذا التوقيت في المحتوى — الجمهور في حالة ذهنية مختلفة خلاله.\n`;
}
