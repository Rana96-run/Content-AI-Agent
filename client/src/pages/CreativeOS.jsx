import { useState, useCallback, useEffect } from "react";

/* ─── PRODUCTS ─── */
const PRODUCTS = [
  /* ── Core products ── */
  {v:"Qoyod Main",   g:"core",ar:"قيود — محاسبة",           color:"#17a3a3",sub:"Accounting + E-Invoice",     trust:"ZATCA Logo",   desc_ar:"نظام محاسبة سحابي سعودي معتمد من ZATCA — فواتير إلكترونية + محاسبة + مخزون + تقارير لحظية",                                                                 desc_en:"Saudi cloud accounting certified by ZATCA — e-invoicing + accounting + inventory + live reports"},
  {v:"QFlavours",    g:"core",ar:"فليفرز — مطاعم وكافيهات", color:"#60a5fa",sub:"F&B POS",                    trust:"ZATCA Phase 2", desc_ar:"نظام إدارة متكامل للمطاعم والكافيهات — كاشير + مخزون + تقارير لحظية + فوترة إلكترونية متوافقة مع هيئة الزكاة والضريبة",                            desc_en:"Integrated F&B management — POS + inventory + live reports + ZATCA-compliant e-invoicing"},
  {v:"QoyodPOS",     g:"core",ar:"قيود POS — تجزئة",        color:"#34d399",sub:"Retail POS",                 trust:"ZATCA Phase 2", desc_ar:"نظام نقاط بيع لقطاع التجزئة — ربط المبيعات بالمحاسبة تلقائياً مع فواتير إلكترونية معتمدة",                                                          desc_en:"Retail POS — automatically links sales to accounting with ZATCA-certified invoicing"},
  {v:"QBookkeeping", g:"core",ar:"مسك الدفاتر",              color:"#a78bfa",sub:"Outsourced Bookkeeping",      trust:"SOCPA",         desc_ar:"خدمة مسك دفاتر باشتراك شهري — فريق محاسبين معتمدين من SOCPA يديرون دفاتر شركتك عن بُعد، دون الحاجة لتوظيف محاسب داخلي بشكل دائم",               desc_en:"Monthly bookkeeping subscription — SOCPA-certified accountants manage your books remotely, no full-time hire needed"},

  /* ── Audience segments ── */
  {v:"Qoyod Accountants",g:"segment",ar:"قيود للمحاسبين",        color:"#06b6d4",sub:"للمحاسبين المحترفين",   trust:"SOCPA",         desc_ar:"قيود للمحاسبين — إدارة ملفات عملاء متعددين من لوحة تحكم واحدة مع تقارير ZATCA جاهزة لكل عميل",   desc_en:"Qoyod for accountants — manage multiple client files from one dashboard with per-client ZATCA reports"},
  {v:"Qoyod Owners",     g:"segment",ar:"قيود لأصحاب الأعمال",   color:"#f59e0b",sub:"Business Owners",       trust:"ZATCA",         desc_ar:"قيود لأصحاب الأعمال — تابع أرقامك وتقاريرك المالية بنفسك من أي جهاز، دون الحاجة لمحاسب في كل خطوة", desc_en:"Qoyod for business owners — monitor your financials yourself from any device, no accountant needed at every step"},

  /* ── Services ── */
  {v:"VAT Services",       g:"service",ar:"خدمات ضريبة القيمة المضافة",  color:"#ef4444",sub:"VAT Management",       trust:"ZATCA",         desc_ar:"إدارة ضريبة القيمة المضافة — تسجيل، إعداد الإقرارات الدورية، ومطابقة تلقائية مع هيئة الزكاة والضريبة والجمارك",                                                                                      desc_en:"VAT management — registration, periodic return filing, and auto-reconciliation with ZATCA"},
  {v:"Tax Declarations",   g:"service",ar:"الإقرارات الضريبية",           color:"#f87171",sub:"Tax Returns",             trust:"ZATCA",         desc_ar:"خدمة إعداد وتقديم الإقرارات الضريبية الدورية بدقة واحترافية — تجنّب الغرامات واستوفِ التزاماتك الضريبية في الوقت المحدد دون أخطاء",                                                              desc_en:"Professional periodic tax return preparation and submission — avoid penalties and meet your ZATCA obligations accurately and on time"},
  {v:"Company Formation",  g:"service",ar:"خدمة التأسيس",                 color:"#fb923c",sub:"Business Setup",           trust:"ZATCA",         desc_ar:"خدمة تأسيس الشركات من الألف إلى الياء — تسجيل، رخص، ملفات ضريبية، وإعداد النظام المحاسبي لتبدأ عملك بشكل احترافي من اليوم الأول",                                                              desc_en:"End-to-end company formation — registration, licenses, tax files, and accounting system setup so you launch professionally from day one"},
  {v:"Account Cleanup",    g:"service",ar:"خدمة ترتيب الحسابات",          color:"#fbbf24",sub:"Books Cleanup",            trust:"SOCPA",         desc_ar:"خدمة ترتيب الحسابات وتصحيح الأخطاء المحاسبية — مراجعة شاملة لدفاتر شركتك وتنظيم السجلات المالية لتكون جاهزاً للتدقيق والإقرارات",                                                             desc_en:"Books cleanup and accounting error correction — comprehensive review and organization of your financial records so you're audit and tax-ready"},
  {v:"API Integration",    g:"service",ar:"التكامل عبر API",               color:"#8b5cf6",sub:"API Integration",         trust:"REST API",       desc_ar:"ربط أنظمتك بمنصة قيود عبر API — أتمتة الفواتير والمخزون والمدفوعات مع أي منصة تجارية أو تطبيق خارجي",                                                                                      desc_en:"Connect your systems to Qoyod via API — automate invoices, inventory and payments with any platform or app"},
  {v:"E-Invoice",          g:"service",ar:"الفاتورة الإلكترونية",         color:"#10b981",sub:"ZATCA Phase 2",           trust:"ZATCA Phase 2", desc_ar:"نظام الفواتير الإلكترونية المرحلة الثانية من ZATCA — إصدار وإرسال وأرشفة تلقائية لكل فاتورة دون تعقيدات تقنية",                                                                                  desc_en:"ZATCA Phase 2 e-invoicing — automatically issue, transmit and archive every invoice without technical complexity"},

  /* ── Seasonal offers ── */
  {v:"Offer-Ramadan",    g:"offer",ar:"عرض رمضان",    color:"#f59e0b",sub:"Ramadan Campaign",    trust:"عرض محدود",period:"رمضان",   desc_ar:"عرض رمضان — خصم خاص + دعم على مدار الساعة طوال شهر رمضان المبارك لجميع المشتركين الجدد",           desc_en:"Ramadan offer — exclusive discount + round-the-clock support throughout Ramadan for new subscribers"},
  {v:"Offer-NationalDay",g:"offer",ar:"اليوم الوطني",color:"#16a34a",sub:"National Day 23 Sep", trust:"عرض موسمي",period:"23 سبتمبر",desc_ar:"عرض اليوم الوطني السعودي — خصم احتفالي لجميع الشركات المنضمة خلال موسم اليوم الوطني",                desc_en:"Saudi National Day offer — celebratory discount for all businesses joining during National Day season"},
  {v:"Offer-FoundingDay",g:"offer",ar:"يوم التأسيس", color:"#0ea5e9",sub:"Founding Day 22 Feb", trust:"عرض موسمي",period:"22 فبراير",desc_ar:"عرض يوم التأسيس — سعر تأسيسي خاص للشركات الناشئة والمؤسسين الجدد الراغبين في الانطلاق بشكل احترافي",desc_en:"Founding Day offer — special founding price for startups and new business founders"},
  {v:"Offer-YearEnd",    g:"offer",ar:"نهاية العام",  color:"#a855f7",sub:"Year-End Campaign",   trust:"عرض محدود",period:"ديسمبر",  desc_ar:"عرض نهاية العام — أفضل سعر لإغلاق السنة المالية باحترافية والانطلاق في العام الجديد منظماً",           desc_en:"Year-end offer — best price to close your fiscal year professionally and start the new year organized"},
];

/* ─── FEATURES ─── */
const FEATURES = [
  {v:"zatca",          ar:"الفاتورة الإلكترونية",     desc_ar:"إصدار فواتير إلكترونية معتمدة ZATCA في ثوانٍ — المرحلتان الأولى والثانية",                                desc_en:"Issue ZATCA-certified e-invoices in seconds — Phase 1 and Phase 2 ready"},
  {v:"tax_declaration",ar:"الإقرار الضريبي",          desc_ar:"إعداد وتقديم الإقرارات الضريبية الدورية لضريبة القيمة المضافة بدقة وفي الوقت المحدد دون أخطاء",         desc_en:"Prepare and submit periodic VAT returns accurately and on time without errors"},
  {v:"reports",        ar:"التقارير المالية",          desc_ar:"تقارير يومية وأسبوعية وشهرية — أرباح وخسائر، ميزانية عمومية، وتقارير مخصصة",                            desc_en:"Daily/weekly/monthly reports — P&L, balance sheet, and custom reports"},
  {v:"inventory",      ar:"إدارة المخزون",            desc_ar:"تحكّم كامل في مخزونك — تحديث فوري عند كل عملية بيع أو شراء",                                            desc_en:"Full inventory control — real-time updates on every sale or purchase"},
  {v:"mobile_mgmt",   ar:"إدارة كل شيء من جهازك",  desc_ar:"سيطر على عملك بالكامل من هاتفك أو جهازك اللوحي — في أي وقت ومن أي مكان",                                desc_en:"Run your entire business from your phone or tablet — anytime, anywhere"},
  {v:"integrations",  ar:"الربط الإلكتروني",          desc_ar:"ربط متكامل مع منصات الدفع والبنوك وأنظمة التجارة الإلكترونية",                                           desc_en:"Seamless integration with payment platforms, banks and e-commerce systems"},
  {v:"support",        ar:"الدعم الفني على مدار الساعة",desc_ar:"فريق دعم متاح داخل النظام على مدار الساعة — ردود سريعة وحلول فورية",                                 desc_en:"Support team available in-system around the clock — fast responses, instant solutions"},
  {v:"bookkeeping_pain",ar:"مسك الدفاتر — بدون توظيف دائم",desc_ar:"فريق محاسبين معتمدين من SOCPA يديرون دفاتر شركتك عن بُعد — وفّر تكاليف التوظيف الثابتة",         desc_en:"SOCPA-certified accountants manage your books remotely — save on full-time hiring costs"},
  {v:"budgeting",      ar:"الميزانيات التقديرية",      desc_ar:"ضع ميزانية لكل قسم — تابع الفعلي مقابل المخطط لحظياً واتخذ قرارات مالية مبنية على بيانات",               desc_en:"Set per-department budgets — track actual vs planned in real time for data-driven decisions"},
  {v:"recurring",      ar:"المعاملات المتكررة",        desc_ar:"أتمتة الفواتير والمصروفات المتكررة تلقائياً — لا تفوّت دفعة أو اشتراكاً",                               desc_en:"Automate recurring invoices and expenses — never miss a payment or subscription"},
];

/* ─── SECTORS ─── */
const SECTORS = [
  {v:"General",ar:"عام",en:"General"},{v:"Retail",ar:"التجزئة",en:"Retail"},
  {v:"Restaurant",ar:"المطاعم",en:"F&B"},{v:"RealEstate",ar:"العقارات",en:"Real Estate"},
  {v:"Tech",ar:"التقنية",en:"Tech"},{v:"Law",ar:"المحاماة",en:"Law"},
  {v:"Education",ar:"التعليم",en:"Education"},{v:"Construction",ar:"المقاولات",en:"Construction"},
  {v:"Manufacturing",ar:"المصانع",en:"Manufacturing"},
];

/* ─── COMPETITORS ─── */
const COMPS = [
  {id:"daftra", n:"دفترة",   en:"Daftra",    lb:"#0047FF",lt:"D",c:"#6699ff",chs:["IG","FB","LI","X","TK"],thr:"high",war:"تعدد رسائل، لهجة مصرية",          wae:"Multi-message, Egyptian dialect",       domain:"daftra.com",    pricing:"https://www.daftra.com/ar/pricing"},
  {id:"dafater",n:"دفاتر",   en:"Dafater",   lb:"#e11d48",lt:"D",c:"#f43f5e",chs:["FB","LI","IG"],        thr:"mid", war:"ERP فقط، قوة للمخازن",             wae:"ERP-focused, inventory-heavy",          domain:"dafater.com",   pricing:"https://www.dafater.com/pricing"},
  {id:"foodics",n:"فودكس",   en:"Foodics",   lb:"#7c3aed",lt:"F",c:"#c084fc",chs:["IG","TK","X","LI"],    thr:"high",war:"F&B أساساً — مو شامل",            wae:"Primarily F&B only",                    domain:"foodics.com",   pricing:"https://www.foodics.com/ar/pricing"},
  {id:"rewaa",  n:"رواء",    en:"Rewaa",     lb:"#0f766e",lt:"R",c:"#4dd9b0",chs:["IG","X","TK"],         thr:"high",war:"ZATCA+مخزون — ليس محاسبة كاملة", wae:"Strong ZATCA+inventory — not full accounting", domain:"rewaatech.com", pricing:"https://www.rewaatech.com/pricing"},
  {id:"wafeq",  n:"وافق",    en:"Wafeq",     lb:"#0369a1",lt:"W",c:"#67d4ee",chs:["IG","X","LI"],         thr:"mid", war:"باقات معقدة، لا POS",              wae:"Complex tiers, no POS",                 domain:"wafeq.com",     pricing:"https://wafeq.com/ar/pricing"},
  {id:"smacc",  n:"SMACC",   en:"SMACC",     lb:"#1e40af",lt:"S",c:"#93c5fd",chs:["IG","FB","LI"],        thr:"mid", war:"لا ZATCA أصلي، واجهة قديمة",      wae:"No native ZATCA, dated UI",             domain:"smacc.com",     pricing:"https://www.smacc.com/pricing"},
  {id:"alostaz",n:"الأستاذ", en:"Al-Ostaz",  lb:"#374151",lt:"A",c:"#9ca3af",chs:["FB"],                  thr:"low", war:"ليس سحابي",                       wae:"Not cloud-native",                      domain:"alostaz.com",   pricing:null},
  {id:"zoho",   n:"Zoho/QB", en:"Zoho/QB",   lb:"#d97706",lt:"Z",c:"#fbbf24",chs:["LI","FB"],             thr:"mid", war:"أجنبي، لا ZATCA أصلي",             wae:"Foreign, no native ZATCA",              domain:"zoho.com",      pricing:"https://www.zoho.com/sa/books/pricing/"},
];

/* ─── CAMPAIGN REFERENCES ─── */
const CAMPS = [
  {id:"F07",ar:"POS — نقاط البيع تعطيك بيع، قيود يعطيك الصورة المالية الكاملة",en:"POS gives sales, Qoyod gives the full financial picture",s:"POS",st:"TOF"},
  {id:"F15",ar:"تجارة إلكترونية — بدون محاسبة = فوضى",en:"Ecommerce — without accounting = chaos",s:"Ecomm",st:"TOF"},
  {id:"C01",ar:"مسك الدفاتر — فريق SOCPA + منصة قيود = أرقامك تحت السيطرة",en:"Bookkeeping — SOCPA team + Qoyod = numbers under control",s:"BK",st:"MOF"},
  {id:"C03",ar:"مسك الدفاتر — ركّز على نموك واترك مسك الدفاتر علينا",en:"Focus on growth, leave bookkeeping to us",s:"BK",st:"TOF"},
  {id:"BK01",ar:"مسك الدفاتر — كابوس المالي: غرامات التأخير والأخطاء",en:"Financial nightmare: fines and accounting errors",s:"BK",st:"TOF"},
  {id:"C05",ar:"E-Invoice — جهّز تكاملك قبل موعد موجتك",en:"E-Invoice — prepare before your wave deadline",s:"ZATCA",st:"TOF"},
  {id:"C07",ar:"ZATCA — قيود معتمد — جاهز للمرحلة الثانية",en:"ZATCA certified — ready for Phase 2",s:"ZATCA",st:"BOF"},
  {id:"FL01",ar:"فليفرز — أسرع نظام كاشير لإنتاجية أسرع",en:"QFlavours — fastest cashier system for higher productivity",s:"F&B",st:"TOF"},
  {id:"FL02",ar:"فليفرز — أدر مطعمك من جوالك: طلبات + مخزون + فروع",en:"QFlavours — manage your restaurant from your phone",s:"F&B",st:"MOF"},
  {id:"FL03",ar:"فليفرز — إدارة احترافية للمطاعم والمقاهي، من الطلبات للمخزون",en:"QFlavours — professional F&B management",s:"F&B",st:"TOF"},
  {id:"FL04",ar:"فليفرز — شاشة الكاشير + لوحة المطبخ + التقارير من مكان واحد",en:"QFlavours — cashier + kitchen display + reports in one place",s:"F&B",st:"MOF"},
  {id:"RE01",ar:"عقارات — تابع مشاريعك وأصدر تقاريرك بدقة",en:"Real Estate — track projects and issue precise reports",s:"RE",st:"MOF"},
  {id:"RTL01",ar:"تجزئة — اربط نقاط البيع لتقارير دقيقة ومتابعة لحظية",en:"Retail — connect POS for precise reports",s:"Retail",st:"MOF"},
  {id:"TY01",ar:"أسهل فاتورة إلكترونية لأفضل إدارة مالية",en:"Easiest e-invoice for best financial management",s:"قيود",st:"TOF"},
  {id:"TY02",ar:"نظام بسيط لإدارة الأرباح — معتمد من هيئة الزكاة والضريبة والجمارك",en:"Simple profit management — ZATCA certified",s:"قيود",st:"TOF"},
  {id:"TY06",ar:"المرحلة الأخيرة من الفاتورة الإلكترونية بدأت الآن",en:"Final e-invoicing phase has started now",s:"ZATCA",st:"TOF"},
  {id:"TY09",ar:"مسير رواتب تلقائي بالكامل — بدقة وسرعة",en:"Fully automatic payroll — accurate and fast",s:"قيود",st:"MOF"},
  {id:"TY10",ar:"كل أعمالك من جوالك — فواتير وتقارير بضغطة زر",en:"All your business from your phone",s:"قيود",st:"TOF"},
];


/* ─── HOOK TYPES ─── */
const HOOK_TYPES = [
  {v:"Fear",ar:"خوف — مشكلة وعواقبها",en:"Fear — problem & consequences"},
  {v:"Time",ar:"وقت ضائع",en:"Time wasted"},
  {v:"Simplicity",ar:"السهولة — بدون خبرة",en:"Simplicity — no expertise"},
  {v:"Control",ar:"تحكم — اعرف أرباحك",en:"Control — know your profits"},
  {v:"SocialProof",ar:"إثبات اجتماعي — 25,000 شركة",en:"Social Proof — 25K companies"},
  {v:"BeforeAfter",ar:"قبل وبعد — مقارنة",en:"Before/After — comparison"},
  {v:"Auto",ar:"تلقائي — الذكاء الاصطناعي يختار",en:"Auto — AI decides"},
];


/* ─── CREATIVE LIBRARY ─── */
const CREATIVE_LIBRARY = [
  {id:"CR01",category:"فاتورة إلكترونية",funnel:"TOF",format:"4:5",style:"قبل/بعد — ورقة + ZATCA",headline:"الفرق بين الفواتير الورقية والإلكترونية",sub_top:"دقيقة، آمنة، وسهلة المتابعة",sub_bot:"معرضة للأخطاء، والضياع وسهلة التزوير",colors:"أبيض + أزرق داكن + تدرج سماوي",trust:"QOYOD Logo",cta:"qoyod.com",visual:"فاتورة ضريبية بيضاء + QR code على خلفية متدرجة أزرق/سماوي",notes:"تصميم split بدون حواجز — الفاتورة تقطع الخلفية بزاوية"},
  {id:"CR02",category:"فاتورة إلكترونية",funnel:"TOF",format:"1:1",style:"شخصية توضيحية + خلفية بنفسجية",headline:"المرحلة الأخيرة من الفاتورة الإلكترونية",sub_top:"بدأت الآن",colors:"أبيض + بنفسجي فاتح",trust:"QOYOD Logo",cta:"qoyod.com",visual:"رجل يكتب على ورق — flat illustration — بنفسجي/أبيض",notes:"نمط الشخصية المسطحة — ألوان ناعمة — نص كبير يملأ أعلى الإعلان"},
  {id:"CR03",category:"فاتورة إلكترونية",funnel:"BOF",format:"1:1",style:"قبل/بعد — إيصال",headline:"الفاتورة الإلكترونية بضغطة زر!",sub_top:"مع قيود",sub_bot:"في الماضي",colors:"أزرق داكن #021544 + أصفر-أخضر #b5d500",trust:"QOYOD Logo",cta:"ابدأ تجربتك المجانية",visual:"إيصال QOYOD أبيض نظيف (يسار) vs ورق مكتوب يدوياً (يمين)",notes:"اللون الأصفر-أخضر للـ CTA — استخدام بالحملات الترويجية فقط"},
  {id:"CR04",category:"ZATCA / ضريبة",funnel:"TOF",format:"9:16",style:"شخصية توضيحية + خلفية بنفسجية",headline:"إقرارك الضريبي بضغطة زر",colors:"أبيض + بنفسجي متدرج",trust:"QOYOD Logo",cta:"qoyod.com",visual:"رجل يحمل جهازاً لوحياً مع إقرار ضريبي — flat illustration",notes:"نمط 9:16 للقصص — نص كبير أعلى — شخصية أسفل"},
  {id:"CR05",category:"فاتورة إلكترونية",funnel:"MOF",format:"1:1",style:"رسم توضيحي ثلاثي الأبعاد + بنفسجي",headline:"أصدر فاتورتك الإلكترونية بكل سهولة من جوالك",colors:"أبيض + بنفسجي فاتح",trust:"QOYOD Logo",cta:"qoyod.com",visual:"جوال + إيصال يخرج منه + يد تطبع — 3D isometric illustration",notes:"أسلوب ثلاثي الأبعاد ناعم — مناسب للمرحلة الوسطى"},
  {id:"CR06",category:"ZATCA — عاجل",funnel:"TOF",format:"16:9",style:"فاتورة حقيقية + نص عاجل",headline:"لا تأخرها! المرحلة الأخيرة من الفاتورة الإلكترونية بدأت",colors:"أزرق ملكي #021544 + سماوي #17a3a3",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"تجربة مجانية",visual:"فاتورة ضريبية حقيقية QOYOD على اليسار — نص عاجل يمين",notes:"شعار هيئة الزكاة ضروري في هذا النوع — يرفع الثقة بشكل كبير"},
  {id:"CR07",category:"ZATCA — عاجل",funnel:"TOF",format:"1:1",style:"فاتورة + لابتوب + نص عاجل",headline:"لا تنتظر! تأكد أن نظامك جاهز للمرحلة الثانية",colors:"أزرق ملكي + سماوي",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"ابدأ اليوم وجرّب سهولة إصدار الفواتير مع قيود",visual:"لابتوب MacBook Pro يعرض واجهة قيود + فاتورة تطفو فوقه",notes:"دمج الجهاز الحقيقي مع الفاتورة — أسلوب أكثر احترافية للـ B2B"},
  {id:"CR08",category:"فاتورة إلكترونية",funnel:"BOF",format:"1:1",style:"شخص سعودي حقيقي + جوال",headline:"فواتير إلكترونية أبسط وأسهل لإدارة مالية أدق وأسرع",colors:"أزرق ملكي + سماوي",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"اشترك الآن",visual:"شاب سعودي بثوب يمسك جوالاً — خلفية زرقاء متدرجة",notes:"أفضل أداء مع الجمهور السعودي المحلي — الشخص لا يبتسم بشكل مبالغ"},
  {id:"CR09",category:"ZATCA — عاجل",funnel:"TOF",format:"9:16",style:"فاتورة + جوال عاجل",headline:"لا تأجلها! وخلك جاهز للمرحلة الثانية",colors:"أزرق/بنفسجي داكن + سماوي",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"اشترك الآن واصدر فواتيرك بكل سهولة",visual:"يد تمسك جوالاً — فاتورة QOYOD + تم الإصدار بنجاح ✓",notes:"عنصر التأكيد ✓ أخضر يرفع الثقة — مناسب جداً للقصص"},
  {id:"CR10",category:"فاتورة إلكترونية",funnel:"MOF",format:"4:5",style:"انفوجرافيك — أسباب",headline:"ليش لازم تتجه إلى الفاتورة الإلكترونية؟",colors:"أبيض + أزرق داكن + سماوي فاتح",trust:"QOYOD Logo",cta:"qoyod.com",visual:"فاتورة حقيقية في المنتصف + 4 أيقونات: تقليل الأخطاء / سرعة الإصدار / متابعة مالية / شفافية",notes:"الانفوجرافيك يؤدي جيداً في LinkedIn وFacebook للجمهور التعليمي"},
  {id:"CR11",category:"ZATCA",funnel:"MOF",format:"4:5",style:"لابتوب + خطوات",headline:"خطوات الاستعداد للمرحلة الثانية من الفاتورة الإلكترونية",colors:"أبيض + أزرق + سماوي",trust:"QOYOD Logo",cta:"qoyod.com",visual:"لابتوب MacBook يعرض ربط قيود بمنصة فاتورة — 3 خطوات بأيقونات ✓",notes:"النمط التعليمي الواضح — مناسب للمرحلة الوسطى + LinkedIn"},
  {id:"CR12",category:"ZATCA — مقارنة",funnel:"TOF",format:"9:16",style:"شخصان سعوديان — قبل/بعد",headline:"غرامة أو التزام؟ القرار عندك",colors:"سماوي فاتح + أزرق داكن",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"اشترك في قيود واربط فواتيرك",visual:"شخصان سعوديان: ملتزم (ملون) vs غير ملتزم (أسود وأبيض)",notes:"التناقض اللوني قوي جداً — أحد أكثر الأنماط تأثيراً في إبراز خطر الغرامة"},
  {id:"CR13",category:"فاتورة إلكترونية",funnel:"BOF",format:"1:1",style:"جوال + فاتورة + ثقة",headline:"فواتير إلكترونية متوافقة بالكامل مع متطلبات هيئة الزكاة والضريبة والجمارك",colors:"أبيض + سماوي فاتح متدرج",trust:"هيئة الزكاة والضريبة والجمارك + QOYOD",cta:"اشترك الآن وابدأ رحلتك المحاسبية بثقة",visual:"يد تمسك جوالاً أبيض — فاتورة تخرج منه — تم الإصدار بنجاح ✓",notes:"الخلفية الفاتحة مع السماوي — مريحة للعين — مناسبة للـ BOF"},
  {id:"CR14",category:"برنامج محاسبي",funnel:"BOF",format:"1:1",style:"جوال + شاشة + ثقة",headline:"برنامج قيود المحاسبي — فوترة سهلة وموثوقة",colors:"أبيض + أزرق داكن",trust:"QOYOD Logo",cta:"ابدأ تجربتك المجانية",visual:"يد تمسك جوالاً أمام شاشة كمبيوتر — فاتورة + تم الإصدار بنجاح ✓",notes:"الجمع بين الجهازين (جوال + شاشة) يعكس مرونة النظام السحابي"},
];

/* ─── CONTENT TOPICS ─── */
const CONTENT_TOPICS = [
  {id:"BL01",title_ar:"إدارة الأزمات المالية",title_en:"Financial Crisis Management",source:"مقال قيود",angle_ar:"كيف يحمي قيود منشأتك في أوقات الأزمات المالية",pain_ar:"أصحاب الأعمال خايفين من أزمات مالية مفاجئة — ما عندهم خطة واضحة",hooks_ar:["الأزمة المالية ما تنتظر — هل منشأتك جاهزة؟","كيف تتعامل مع أزمة مالية وشركتك ما تنهار؟","قيود يعطيك الصورة المالية الكاملة — حتى في أصعب الأوقات"],content_angles:["5 علامات تدل أن منشأتك في أزمة مالية قادمة","الفرق بين من نجا من كورونا ومن لم ينجُ — السبب: التخطيط المالي","كيف تبني خطة (ب) لمنشأتك قبل الأزمة لا بعدها","دور التقارير المالية اللحظية في اتخاذ قرارات سريعة وصحيحة"],cta_ar:"جرّب قيود مجاناً 14 يوم — وخذ السيطرة على أرقامك",formats:["مقال","انفوجرافيك","فيديو تعليمي","كاروسيل"],funnel:"TOF",sector:"عام"},
];

/* ─── EXTRA FEATURES ─── */
const FEATURES_EXTRA = [
  {v:"budgeting",ar:"الميزانيات التقديرية",desc_ar:"ضع ميزانية مسبقة لكل قسم أو مشروع — تابع الفعلي مقابل المخطط لحظياً — تنبيهات عند تجاوز الميزانية",hook_ar:"خططت لـ 50,000 ريال — والفعلي وصل 80,000؟ قيود يخبرك قبل فوات الأوان",sector:"عام / مقاولات / تقنية"},
  {v:"bonds",ar:"خطابات الضمان وضمان التنفيذ",desc_ar:"تتبع خطابات الضمان وضمان التنفيذ — تواريخ الانتهاء — التكاليف المرتبطة بكل مشروع",hook_ar:"خطاب ضمانك انتهى وما عرفت؟ قيود يتابعها عنك",sector:"مقاولات / عقارات"},
  {v:"recurring",ar:"المعاملات المتكررة",desc_ar:"أتمتة الفواتير والمصروفات المتكررة — إيجار / رواتب / اشتراكات — تسجيل تلقائي بدون إدخال يدوي",hook_ar:"كل شهر تدخل نفس الفواتير يدوياً؟ قيود يسجلها تلقائياً",sector:"عام / خدمات"},
];

/* ─── QFlavours DATA ─── */
const QFLAVOURS_LP_HEADLINES = [
  {screen:"شاشة الكاشير",headline:"أسرع نظام كاشير، لإنتاجية أسرع",desc:"واجهة بيع بسيطة تناسب كل المطاعم لإتمام تسجيل الطلبات والدفع في ثواني"},
  {screen:"أنواع الطلبات",headline:"كل أنواع طلباتك — من مكان واحد",desc:"سفري، توصيل، محلي، مسار السيارات — فليفرز يدير الكل"},
  {screen:"لوحة التحكم",headline:"تقارير لحظية لكل فرع",desc:"تابع مبيعاتك وإيراداتك وطلباتك فوراً من أي مكان"},
  {screen:"شاشة المطبخ",headline:"المطبخ منظم — الطلبات ما تضيع",desc:"شاشة المطبخ تُرتّب كل طلب حسب الأولوية والوقت تلقائياً"},
  {screen:"إدارة الطاولات",headline:"اختر الطاولة — ابدأ الطلب فوراً",desc:"خريطة الطاولات تُظهر المتاح والمشغول في لحظة"},
];

const QFLAVOURS_CAPTIONS = [
  {id:1,design:"أسهل فاتورة إلكترونية",captions:["سهل إدارة أعمالك بنظام فواتير ذكي وسهل! وأصدر فواتيرك الإلكترونية من جوالك مع #قيود بثواني، وبدون تعقيد.","تحكم بفواتيرك بدون تعقيد مهما كان وقتك مشغول، تقدر تصدرها وأنت بمكانك وبضغطة وحدة. مع نظام #قيود","خل مهامك أسهل، وفوّتر إلكترونيًا من جوالك مع #قيود!"]},
  {id:2,design:"نظام بسيط لإدارة الأرباح",captions:["لاتدير مصاريفك يدويًا واستخدم #قيود، كل التزاماتك الضريبية وإدارتك المالية أسهل من أي وقت.","اضمن نمو أعمالك بتحكم مالي دقيق! مع نظام #قيود المحاسبي اللي يساعدك تتابع الأرباح والمصاريف من مكان واحد.","كل أموالك من مكان واحد، بنظام يسمح لك تتبع كل مصاريفك بكل سهولة. #قيود"]},
  {id:3,design:"نظام يسهل شغلك",captions:["من الفواتير للتقارير للضريبة، كل المهام تخلصها من منصة واحدة مع #قيود.","تقارير مالية دقيقة؟ تخلصها بضغطة زر مع نظام #قيود لاتشيل هم المحاسبة","جرب #قيود الآن، وابدأ تجربتك المجانية واختصر وقتك وجهدك في إدارة مصاريفك."]},
  {id:4,design:"حساب فوق السحاب",captions:["مع #قيود، بياناتك محفوظة سحابياً لضمان السرعة والدقة والأمان.","ليش تخاطر بأمان معلوماتك؟ حول للنظام الذكي الآن. #قيود","نظامك المحاسبي السحابي يحفظ لك كل شيء، بدون قلق أو خسارة. #قيود"]},
  {id:5,design:"ركّز على نمو أعمالك",captions:["لا تنشغل بالضغط، خلّ النظام يشتغل عنك وركز على توسع مشروعك. #قيود","وفر وقتك للقرارات الكبيرة، وخلي #قيود يدير المهام اليومية.","النمو يحتاج تركيز، و#قيود يخلي وقتك لك."]},
  {id:6,design:"المرحلة الأخيرة من الفاتورة الإلكترونية",captions:["آلاف التجار دخلوا المرحلة الثانية للفوترة الإلكترونية مع #قيود، أنت جاهز؟","تقدر تصدر فواتيرك الإلكترونية الآن وتكون جزء من المرحلة الثانية بكل سلاسة! #قيود","لاتخسر أكثر، انضم لآلاف التجار وابدأ بالمرحلة الثانية مع #قيود"]},
  {id:7,design:"كل حلولك المالية بمكان واحد",captions:["من غير ما تضيع بين أنظمة مختلفة، كل أمورك المالية صارت في مكان واحد مع #قيود","#قيود يجمع لك كل شيء: تقارير، فواتير، ضرائب، مبيعات، جرب قيود بشكل مجاني","سهّل على نفسك، وتابع كل شيء من مكان واحد مع نظام #قيود."]},
  {id:8,design:"مسير رواتب تلقائي بالكامل",captions:["وفّر وقتك وجهدك! مع #قيود، رواتب موظفيك تُصرف تلقائيًا بدون تأخير أو أخطاء.","انتهِ من إعداد مسيرات الرواتب بكبسة زر! نظام #قيود يسهلها عليك بالكامل.","لا تحتاج أوراق ولا إدخال يدوي… رواتبك تُدار بشكل تلقائي مع #قيود، بدقة وسرعة."]},
  {id:9,design:"كل أعمالك من جوالك",captions:["#قيود يصدر لك فواتيرك الإلكترونية والتقارير بسهولة ومن خلال التطبيق","لاتشيل هم الفوترة الإلكترونية #قيود يصدرها لك بضغطة زر","عشان تسهل عليك إصدار الفواتير والتقارير، استخدم #قيود وأصدرها بثوان"]},
];

/* ─── ICP PERSONAS ─── */
const ICP_PERSONAS = [
  {id:"P01",title:"CFO / مدير مالي",en:"Chief Financial Officer",icon:"📊",tier:"A",inflection:"نمو سريع + تعدد الفروع + الامتثال الضريبي",pain_ar:"يحتاج بيانات دقيقة لحظية — الامتثال لـ ZATCA يأخذ وقتاً كبيراً",hook_ar:"أرقامك الحقيقية — في ثوانٍ وليس ساعات",message_ar:"تقارير مالية لحظية + امتثال ZATCA تلقائي = قرارات أسرع بثقة أكبر",cta_ar:"شوف قيود من جوالك",funnel:"MOF",channels:["LinkedIn","Google"]},
  {id:"P02",title:"مؤسس / CEO — شركة صغيرة أو متوسطة",en:"Founder / SME CEO",icon:"🚀",tier:"A",inflection:"أول جولة تمويل — مطلوب سجلات مالية دقيقة للمستثمرين والجهات التنظيمية",pain_ar:"ما عنده خبرة محاسبية — يدير المالية بنفسه — يخاف من الأخطاء",hook_ar:"أدر شركتك بدون توظيف محاسب — قيود يعمل عنك",message_ar:"نظام بسيط يناسب المؤسسين — بدون خبرة محاسبية — ابدأ في دقائق",cta_ar:"ابدأ تجربتك المجانية",funnel:"TOF",channels:["Instagram","Snapchat","LinkedIn"]},
  {id:"P03",title:"مدير مالي",en:"Finance Manager",icon:"💼",tier:"A",inflection:"الانتقال من Excel أو برنامج قديم إلى نظام سحابي",pain_ar:"Excel يسبب أخطاء — البرامج القديمة ما تدعم ZATCA — يريد أتمتة",hook_ar:"وقتك أغلى من إدخال بيانات يدوي",message_ar:"استبدل Excel بنظام محاسبي سحابي — أتمتة كاملة — تقارير بضغطة زر",cta_ar:"جرّب قيود اليوم",funnel:"MOF",channels:["LinkedIn","Google"]},
  {id:"P04",title:"صاحب متجر إلكتروني",en:"E-Commerce Owner",icon:"🛒",tier:"A",inflection:"توسع المتجر + تحديات في إدارة المخزون والمبيعات والمحاسبة",pain_ar:"مخزون متشعب — فواتير يدوية — ما يعرف ربحيته الحقيقية",hook_ar:"كم ربحت اليوم فعلاً؟ قيود يجاوبك فوراً",message_ar:"ربط POS بالمحاسبة تلقائياً — مخزون لحظي — ربحية واضحة",cta_ar:"ابدأ تجربتك المجانية",funnel:"TOF",channels:["Instagram","TikTok","Snapchat"]},
  {id:"P05",title:"مدير العمليات",en:"Operations Manager",icon:"⚙️",tier:"B",inflection:"الفوضى في تتبع المصروفات والعمليات تبطئ الإنتاجية",pain_ar:"لا مركزية — مصروفات مبعثرة — تقارير متأخرة",hook_ar:"كل عملياتك المالية من مكان واحد",message_ar:"مركزة العمليات + تتبع المصروفات + تعاون سلس بين الأقسام",cta_ar:"احجز عرضاً",funnel:"MOF",channels:["LinkedIn","Google"]},
  {id:"P06",title:"محاسب / مسك دفاتر",en:"Accountant / Bookkeeper",icon:"🧾",tier:"A",inflection:"حجم المعاملات كبر — الطرق اليدوية ما تكفي",pain_ar:"ساعات في إدخال بيانات يدوي — أخطاء متكررة — ضغط في نهاية الشهر",hook_ar:"خل قيود يدخل الأرقام — وأنت تركز على التحليل",message_ar:"أتمتة المعاملات المتكررة + امتثال تلقائي + توفير ساعات شهرياً",cta_ar:"جرّب قيود اليوم",funnel:"MOF",channels:["LinkedIn","Facebook"]},
  {id:"P07",title:"صاحب محل تجزئة",en:"Retail Business Owner",icon:"🏪",tier:"A",inflection:"توسع لعدة فروع — يحتاج نظام يجمع المبيعات والمخزون والمالية",pain_ar:"كل فرع بنظام منفصل — مخزون غير متزامن — تقارير يدوية",hook_ar:"أي فرع يربح فعلاً؟ قيود يجاوبك",message_ar:"إدارة متعددة الفروع — مخزون موحد — تقارير لكل فرع ولكل الفروع",cta_ar:"ابدأ تجربتك المجانية",funnel:"TOF",channels:["Instagram","Snapchat","TikTok"]},
  {id:"P08",title:"مستشار ضريبي / مسؤول الامتثال",en:"Tax Consultant",icon:"⚖️",tier:"B",inflection:"تحضير للتدقيق السنوي أو الإقرار الضريبي",pain_ar:"السجلات غير منظمة — مخاطر الغرامات — وقت التدقيق يسبب ضغطاً",hook_ar:"سجلات جاهزة للتدقيق — في أي وقت",message_ar:"فواتير متوافقة مع ZATCA — سجلات منظمة — تقليل مخاطر الغرامات",cta_ar:"شوف قيود من جوالك",funnel:"BOF",channels:["LinkedIn","Google"]},
  {id:"P09",title:"مستشار أعمال للـ SMEs",en:"SME Business Consultant",icon:"🤝",tier:"B",inflection:"يساعد عميلاً على تطوير عملياته — بما فيها برنامج محاسبة",pain_ar:"يبحث عن برنامج موثوق يوصي به لعملائه",hook_ar:"أوصِ عملاءك بالنظام الذي يثق به 25,000+ شركة سعودية",message_ar:"قيود — الخيار الأول للـ SMEs السعودية — ZATCA معتمد — دعم عربي كامل",cta_ar:"احجز عرضاً لعملائك",funnel:"BOF",channels:["LinkedIn"]},
  {id:"P10",title:"مؤسس شركة ناشئة",en:"Startup Founder",icon:"💡",tier:"B",inflection:"أطلق أول منتج — يولّد إيرادات — يحتاج محاسبة أساسية",pain_ar:"يريد حل بسيط ورخيص — ما عنده وقت لتعلم برامج معقدة",hook_ar:"ابدأ في دقائق — بدون خبرة محاسبية ولا بطاقة بنكية",message_ar:"باقة مناسبة للناشئة — سهل الاستخدام — ينمو مع شركتك",cta_ar:"ابدأ تجربتك المجانية",funnel:"TOF",channels:["Instagram","Twitter","LinkedIn"]},
];

/* ─── AD MOCKUP SVG ─── */
/* ─── QOYOD BRAND IDENTITY (injected into AI prompts) ─── */
const QOYOD_VOICE = `QOYOD VOICE (apply to all copy):
- Engaging: informative, personalized, builds trust.
- Confident: believes in itself, communicates value, not afraid to take risks.
- Professional & Clear: polished, articulate, transparent, accurate.
- Fazeea (فزعة): gives more than expected, always strives to serve.
Brand essence: Saudi cloud accounting, born 2016, ZATCA-accredited, no downloads, runs on any device any browser.
Brand values: Fazaa, Empowerment, Sustainability & Growth, Excellence, Innovation.`;

const QOYOD_DESIGN = `QOYOD DESIGN SYSTEM (must be followed in every brief / spec / direction):
- Primary palette: Navy #021544 (main), Deep Turquoise #01355A, Accent Turquoise #17A3A4.
- Sub-product colors: QTahseel = Green, QLend = Blue, QAcademy = Orange, QBookkeeping = Purple. Use the matching color for sub-product creatives.
- Typography: Lama Sans for both Arabic and English (fallback IBM Plex Sans Arabic). Bold for headlines, Medium for subheads, Regular for body.
- Gradient: 45° from top-right to bottom-left, navy → deep turquoise (or deep turquoise → white).
- Layout grid: text upper-right, photos/visuals lower-left, logo lower-right, URL lower-left.
- Square key element: use sparingly — 50% opacity ("soft light") OR outline only.
- Logo rules: never distort, rotate, recolor, add filters/shadows, or place inside a box. Maintain 4× clear space around logo. Min size 15mm.
- Arabic text MUST be right-aligned (RTL). All creative output must be mobile-first — readable on phone screens, tap targets ≥44px, no critical content cut off in safe zones.
- Color balance: background 40% / content 30% / header 20% / others 10% (primary layout).`;

const QOYOD_HTML = `MOBILE-FIRST HTML OUTPUT RULES (mandatory for landing pages):
- <!DOCTYPE html> with <html lang="ar" dir="rtl"> for Arabic, <meta name="viewport" content="width=device-width, initial-scale=1.0">.
- Mobile-first CSS: write base styles for ≤480px first, then @media (min-width:768px) tablet, (min-width:1024px) desktop.
- Tap targets: all buttons/links min-height 48px, generous padding. Font on body: min 16px (prevents iOS zoom). Headlines min 28px mobile / 40px+ desktop. line-height ≥1.5 for Arabic.
- Images/icons: inline SVG or CSS shapes only — no external <img> URLs.
- Forms: full-width inputs on mobile, stacked vertically. Submit button full-width with brand gradient.
- Font: IBM Plex Sans Arabic from Google Fonts: <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">.

REFERENCE DESIGN SYSTEM (match exactly — this is the live Qoyod brand system, validated across 4 production landing pages):
:root {
  --navy:#021544; --navy-deep:#010B2A; --turq-dark:#01355A; --blue:#13778D;
  --turq:#17A3A4; --turq-soft:#CFECEC; --turq-50:#EAF6F6;
  --ink:#0B1220; --ink-soft:#2A3345; --muted:#6B7280; --line:#E4E8EE;
  --bg:#FFFFFF; --bg-soft:#F7FAFB;
  --radius-xl:24px; --radius-lg:18px; --radius-md:12px;
  --shadow-card:0 10px 30px rgba(2,21,68,.08),0 2px 6px rgba(2,21,68,.04);
  --shadow-pop:0 24px 60px rgba(2,21,68,.18);
  --grad-primary:linear-gradient(225deg,var(--navy) 0%,var(--turq-dark) 100%);
  --grad-accent:linear-gradient(225deg,var(--blue) 0%,var(--turq) 100%);
}

LOGO PATTERN (CSS-only, no img tags): Use one of these two patterns:
  Option A (wordmark): <div class="logo-mark"></div><div><div class="logo-word">قيود<span class="accent">.</span></div><div class="logo-sub">ZATCA CERTIFIED</div></div>
  .logo-mark{width:38px;height:38px;border-radius:10px;background:var(--navy);display:grid;place-items:center;position:relative;}
  .logo-mark::after{content:"";position:absolute;width:14px;height:14px;background:var(--turq);border-radius:3px;bottom:7px;right:7px;}
  .logo-word{font-weight:700;font-size:22px;color:var(--navy);letter-spacing:-.5px;}
  .logo-sub{font-size:10px;color:var(--turq);font-weight:600;letter-spacing:1px;}

EYEBROW VARIANTS (choose based on campaign angle):
  Standard (value/feature): .eyebrow { background:var(--turq-50);color:var(--turq-dark);border:1px solid var(--turq-soft);padding:7px 16px;border-radius:100px;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:8px; }
  Urgent (ZATCA deadlines, time-limited offers): .eyebrow-urgent { background:#FFF4E5;color:#8B4513;border:1px solid #FFCC99;border-radius:100px;padding:7px 16px;display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px; }
  Urgent dot: .eyebrow-dot{width:6px;height:6px;border-radius:50%;background:#D97706;animation:pulse 1.6s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
  USE URGENT EYEBROW for: ZATCA phase deadlines, Ramadan/seasonal offers, limited-time trials, compliance urgency campaigns.

BUTTON PATTERN:
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px;border:none;cursor:pointer;transition:transform .15s ease,box-shadow .2s ease,background .2s;font-family:inherit;}
  .btn-primary{background:var(--navy);color:#fff;box-shadow:0 6px 16px rgba(2,21,68,.25);}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(2,21,68,.35);background:var(--turq-dark);}
  .btn-lg{padding:15px 30px;font-size:16px;border-radius:14px;}

FEATURE CARDS:
  .f-card{background:#fff;border-radius:var(--radius-xl);padding:30px 24px;border:1px solid var(--line);transition:.3s cubic-bezier(.2,.7,.3,1);}
  .f-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-pop);border-color:var(--turq-soft);}
  .f-icon{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;margin-bottom:20px;background:var(--turq-50);color:var(--turq-dark);}
  .f-icon svg{width:26px;height:26px;}
  4-column grid desktop, 2-col tablet, 1-col mobile.

HOW IT WORKS CARDS:
  .how-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius-xl);padding:32px 28px;position:relative;}
  .how-num{position:absolute;top:-20px;right:28px;width:48px;height:48px;border-radius:12px;background:var(--grad-primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:19px;box-shadow:0 8px 20px rgba(2,21,68,.3);}
  3-column grid desktop, 1-col mobile.

PRICING CARDS:
  .price-card{background:#fff;border:1.5px solid var(--line);border-radius:var(--radius-xl);padding:36px 30px;display:flex;flex-direction:column;}
  .price-card.featured{border-color:var(--turq);background:linear-gradient(180deg,#fff 0%,var(--turq-50) 100%);box-shadow:var(--shadow-pop);}
  .price-badge{position:absolute;top:-13px;right:30px;background:var(--grad-primary);color:#fff;padding:6px 14px;border-radius:100px;font-size:12px;font-weight:700;}
  .price-amt{font-size:44px;font-weight:700;color:var(--navy);line-height:1;}
  3-column grid desktop.

TESTIMONIAL:
  .testi-card{max-width:880px;margin:0 auto;background:#fff;border-radius:var(--radius-xl);padding:48px 44px;box-shadow:var(--shadow-card);border:1px solid var(--line);}
  .testi-text{font-size:19px;line-height:1.85;font-weight:500;}
  .testi-avatar{width:52px;height:52px;border-radius:50%;background:var(--grad-primary);display:grid;place-items:center;color:#fff;font-weight:700;}

CTA BAND:
  .cta-box{max-width:1100px;margin:0 auto;background:var(--grad-primary);border-radius:var(--radius-xl);padding:60px 48px;text-align:center;color:#fff;position:relative;overflow:hidden;}
  .cta-box::before{content:"";position:absolute;top:-60px;left:-60px;width:260px;height:260px;background:#fff;opacity:.06;border-radius:32px;transform:rotate(14deg);}
  .cta-box::after{content:"";position:absolute;bottom:-80px;right:-40px;width:300px;height:300px;background:var(--turq);opacity:.14;border-radius:40px;transform:rotate(-18deg);}
  Button inside CTA band: background:#fff;color:var(--navy); hover → background:var(--turq);color:#fff.

SECTION HEADER PATTERN:
  .sec-eyebrow{display:inline-block;background:var(--turq-50);color:var(--turq-dark);padding:6px 16px;border-radius:100px;font-weight:600;font-size:13px;margin-bottom:14px;border:1px solid var(--turq-soft);}
  .sec-title{font-size:clamp(28px,3.5vw,40px);font-weight:700;color:var(--navy);letter-spacing:-.3px;}
  .sec-sub{font-size:17px;color:var(--ink-soft);}

FORM FIELDS:
  border:1.5px solid var(--line);border-radius:12px;padding:13px 14px;font-size:15px;background:var(--bg-soft);transition:border-color .2s,background .2s,box-shadow .2s;
  Focus: border-color:var(--turq);background:#fff;box-shadow:0 0 0 3px rgba(23,163,164,.12);
  Hero form card: background:#fff;border-radius:var(--radius-xl);box-shadow:var(--shadow-pop);padding:34px;border:1px solid var(--line); ::before pseudo glow var(--grad-primary) blur 24px opacity .18.
  Phone input: grid(110px 1fr) gap 8px — country code select + phone input.
  Form 2-col grid for name fields, 2-col for phone+email, single for city/company.

FAQ: use <details>/<summary> elements — no JS needed.
  summary{font-weight:600;cursor:pointer;padding:18px 0;} details[open]{border-color:var(--turq);}

NAVIGATION:
  Sticky, z-index:50, background:rgba(255,255,255,.95), backdrop-filter:blur(14px), border-bottom:1px solid var(--line).
  Links: font-weight:500;color:var(--ink-soft); hover: color:var(--navy). Hide nav links at max-width:900px.

FOOTER: var(--navy-deep) background, 4-column grid (1.5fr 1fr 1fr 1fr), footer links, copyright bar with 1px rgba white border-top.`;

function Mockup({hl="",hk="",ct="",ratio="1:1",prod="Qoyod Main",variant=1}){
  const sizes={"1:1":[240,240],"4:5":[240,300],"9:16":[180,320],"16:9":[300,168]};
  const [w,h]=sizes[ratio]||[240,240];
  const bg1=prod==="QBookkeeping"?"#0c1a6b":prod==="QFlavours"?"#0a1628":prod==="QoyodPOS"?"#042d1a":"#021544";
  const bg2=prod==="QBookkeeping"?"#1a2db5":prod==="QFlavours"?"#0f2352":prod==="QoyodPOS"?"#065f35":"#01355a";
  const ac=prod==="QBookkeeping"?"#f5a623":prod==="QFlavours"?"#60a5fa":prod==="QoyodPOS"?"#34d399":"#17a3a3";
  const h2=(hl||"").slice(0,32),h3=(hk||"").slice(0,38),c2=(ct||"ابدأ الآن").slice(0,14);
  const uid=`${w}x${h}v${variant}`;
  const isNarrow=w<200,fs1=isNarrow?11:12.5,fs2=isNarrow?7.5:8,pad=isNarrow?8:10;
  const maxC1=isNarrow?12:18,maxC2=isNarrow?18:32;
  const btnW=isNarrow?70:84,btnH=isNarrow?20:22,btnFS=isNarrow?7.5:8.5;
  if(variant===2){
    return(
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`v2bg${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={bg1}/><stop offset="100%" stopColor={bg2}/></linearGradient>
          <linearGradient id={`v2btn${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={ac}/><stop offset="100%" stopColor="#13778d"/></linearGradient>
        </defs>
        <rect width={w} height={h} fill={`url(#v2bg${uid})`}/>
        <circle cx={Math.round(w*.25)} cy={Math.round(h*.65)} r={Math.round(w*.38)} fill={ac} opacity=".07"/>
        <circle cx={Math.round(w*.22)} cy={Math.round(h*.52)} r="20" fill={ac} opacity=".9"/>
        <rect x={Math.round(w*.13)} y={Math.round(h*.56)} width="18" height="24" rx="4" fill={ac} opacity=".8"/>
        <rect x={Math.round(w*.22)} y={Math.round(h*.56)} width="18" height="24" rx="4" fill={ac} opacity=".8"/>
        <text x={w-pad} y={Math.round(h*.15)} fontSize="15" fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">{h2.slice(0,14)}</text>
        {h2.length>14&&<text x={w-pad} y={Math.round(h*.15+18)} fontSize="15" fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">{h2.slice(14,28)}</text>}
        <text x={w-pad} y={Math.round(h*.82)} fontSize="8.5" fill={ac} textAnchor="end" fontFamily="sans-serif">{h3.slice(0,30)}</text>
        <rect x={Math.round(w/2-42)} y={Math.round(h*.87)} width="84" height="21" rx="10" fill={`url(#v2btn${uid})`}/>
        <text x={w/2} y={Math.round(h*.87+13)} fontSize="8" fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{c2}</text>
        <text x={w-8} y={h-7} fontSize="7" fill="rgba(255,255,255,.25)" textAnchor="end" fontFamily="sans-serif">QOYOD</text>
      </svg>
    );
  }
  const lh=Math.round(h*.14);
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`g1${uid}`} x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={bg1}/><stop offset="100%" stopColor={bg2}/></linearGradient>
        <linearGradient id={`g2${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={ac}/><stop offset="100%" stopColor="#13778d"/></linearGradient>
        <linearGradient id={`g3${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.08)"/><stop offset="100%" stopColor="rgba(255,255,255,.01)"/></linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#g1${uid})`}/>
      <circle cx={Math.round(w*.12)} cy={Math.round(h*.12)} r={Math.round(w*.35)} fill="rgba(23,163,164,.04)"/>
      <rect x={pad} y={Math.round(h*.44)} width={Math.round(w*.82)} height={Math.round(h*.28)} rx="7" fill={`url(#g3${uid})`} stroke="rgba(23,163,164,.25)" strokeWidth="1.5"/>
      <rect x={pad+8} y={Math.round(h*.47)} width={Math.round(w*.32)} height="4" rx="2" fill={ac} opacity=".55"/>
      <rect x={pad+8} y={Math.round(h*.47+10)} width={Math.round(w*.42)} height="3" rx="1.5" fill="rgba(255,255,255,.15)"/>
      <rect x={pad+8}  y={Math.round(h*.63)} width="8" height="14" rx="2" fill={ac} opacity=".35"/>
      <rect x={pad+20} y={Math.round(h*.61)} width="8" height="16" rx="2" fill={ac} opacity=".55"/>
      <rect x={pad+32} y={Math.round(h*.58)} width="8" height="19" rx="2" fill={ac} opacity=".75"/>
      <rect x={pad+44} y={Math.round(h*.55)} width="8" height="22" rx="2" fill={ac}/>
      <text x={w-pad} y={lh} fontSize={fs1} fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">{h2.slice(0,maxC1)}</text>
      {h2.length>maxC1&&<text x={w-pad} y={lh+fs1+3} fontSize={fs1} fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">{h2.slice(maxC1,maxC1*2)}</text>}
      {h2.length>maxC1*2&&<text x={w-pad} y={lh+(fs1+3)*2} fontSize={fs1} fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">{h2.slice(maxC1*2,maxC1*3)}</text>}
      <text x={w-pad} y={Math.round(h*.38)} fontSize={fs2} fill="rgba(255,255,255,.42)" textAnchor="end" fontFamily="sans-serif">{h3.slice(0,maxC2)}</text>
      <rect x={w-pad-32} y={Math.round(h*.40)} width="32" height="12" rx="4" fill="rgba(245,166,35,.12)" stroke="rgba(245,166,35,.28)" strokeWidth="1"/>
      <text x={w-pad-16} y={Math.round(h*.40+8)} fontSize="5.5" fill="#f5a623" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">ZATCA ✓</text>
      <rect x={Math.round(w/2-btnW/2)} y={Math.round(h*.83)} width={btnW} height={btnH} rx={Math.round(btnH/2)} fill={`url(#g2${uid})`}/>
      <text x={w/2} y={Math.round(h*.83+btnH*.64)} fontSize={btnFS} fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{c2}</text>
      <text x={w-pad} y={h-6} fontSize="6.5" fill="rgba(255,255,255,.25)" textAnchor="end" fontFamily="sans-serif">QOYOD</text>
    </svg>
  );
}

/* ─── DEVICE MOCKUP SVG ─── */
function DeviceMockup({screen="dashboard",prod="QFlavours",w=320,h=240}){
  const isFl=prod==="QFlavours";
  const uiBg=isFl?"#f5f6fa":"#0a1f3d",uiHdr=isFl?"#1e1b4b":"#021544";
  const uiAcc=isFl?"#4f46e5":"#17a3a3",uiSub=isFl?"#6b7280":"#6a96aa";
  const uiTxt=isFl?"#1e1b4b":"#ddeef4";
  const uid=`dm${w}${h}${prod}${screen}`;
  if(screen==="cashier"){
    return(
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width={w} height={h} rx="12" fill="#1a1a2e" stroke="#f97316" strokeWidth="2"/>
        <rect x="6" y="6" width={w-12} height={h-12} rx="8" fill={uiBg}/>
        <rect x="6" y="6" width={w-12} height="22" rx="8" fill={uiHdr}/>
        <rect x="6" y="18" width={w-12} height="10" fill={uiHdr}/>
        <text x={w-16} y="21" fontSize="7" fill="white" fontWeight="700" textAnchor="end" fontFamily="sans-serif">شاشة الكاشير</text>
        <rect x="6" y="28" width={w-12} height="14" fill="white" stroke="#e5e7eb" strokeWidth=".5"/>
        {["جميع المنتجات","برغر","مشروبات","كيك"].map((cat,i)=>(
          <g key={i}>
            <rect x={Math.round(w*.08)+i*Math.round(w*.22)} y="30" width={Math.round(w*.2)} height="10" rx="5" fill={i===0?uiAcc:"#f3f4f6"} stroke={i===0?"none":"#e5e7eb"} strokeWidth=".5"/>
            <text x={Math.round(w*.08)+i*Math.round(w*.22)+Math.round(w*.1)} y="37" fontSize="5" fill={i===0?"white":uiSub} textAnchor="middle" fontFamily="sans-serif">{cat}</text>
          </g>
        ))}
        {[{n:"Burgers",p:"20.00"},{n:"Deep-fried Oreos",p:"5.00"},{n:"Salted Caramel",p:"10.00"}].map((item,i)=>{
          const cx=Math.round(w*.08)+i*Math.round(w*.3);
          return(
            <g key={i}>
              <rect x={cx} y="46" width={Math.round(w*.27)} height={Math.round(h*.35)} rx="5" fill="white" stroke="#e5e7eb" strokeWidth=".8"/>
              <rect x={cx+Math.round(w*.035)} y="52" width={Math.round(w*.2)} height={Math.round(h*.12)} rx="3" fill={uiAcc} opacity=".15"/>
              <text x={cx+Math.round(w*.135)} y="74" fontSize="5.5" fill={uiTxt} fontWeight="600" textAnchor="middle" fontFamily="sans-serif">{item.n}</text>
              <text x={cx+Math.round(w*.135)} y="82" fontSize="5" fill={uiAcc} textAnchor="middle" fontFamily="sans-serif">﷼ {item.p}</text>
              <rect x={cx+Math.round(w*.04)} y="86" width={Math.round(w*.19)} height="9" rx="4" fill={uiAcc}/>
              <text x={cx+Math.round(w*.135)} y="92.5" fontSize="5" fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">+ اضف</text>
            </g>
          );
        })}
        <rect x="6" y={Math.round(h*.57)} width={w-12} height={Math.round(h*.29)} fill="white" stroke="#e5e7eb" strokeWidth=".5"/>
        <text x="14" y={Math.round(h*.62)} fontSize="7" fontWeight="700" fill={uiAcc} fontFamily="sans-serif">﷼ 35.00</text>
        <rect x="6" y={Math.round(h*.87)} width={Math.round((w-12)*.48)} height={Math.round(h*.1)} rx="5" fill="#374151"/>
        <text x={Math.round(w*.25)} y={Math.round(h*.93)} fontSize="6.5" fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">ادفع لاحقًا</text>
        <rect x={Math.round(w*.52)} y={Math.round(h*.87)} width={Math.round((w-12)*.48)} height={Math.round(h*.1)} rx="5" fill={uiAcc}/>
        <text x={Math.round(w*.76)} y={Math.round(h*.93)} fontSize="6.5" fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">ادفع الآن</text>
      </svg>
    );
  }
  if(screen==="kitchen"){
    return(
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        <rect width={w} height={h} rx="12" fill="#1a1a2e" stroke="#f97316" strokeWidth="2"/>
        <rect x="6" y="6" width={w-12} height={h-12} rx="8" fill={uiBg}/>
        <rect x="6" y="6" width={w-12} height="20" rx="8" fill={uiHdr}/>
        <rect x="6" y="16" width={w-12} height="10" fill={uiHdr}/>
        <text x={w/2} y="19" fontSize="7" fill="white" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">شاشة المطبخ</text>
        {[{label:"انتظار",color:"#f97316",id:"#0006",item:"Salted Caramel x1"},{label:"قيد التنفيذ",color:"#4f46e5",id:"#0005",item:"Deep-fried Oreos x1"},{label:"مكتمل",color:"#22c55e",id:"#0001",item:"Burgers x1"}].map((col,ci)=>{
          const cw=Math.round((w-18)/3),cx=6+ci*(cw+3);
          return(
            <g key={ci}>
              <rect x={cx} y="28" width={cw} height={h-34} rx="5" fill="white" stroke="#e5e7eb" strokeWidth=".8"/>
              <rect x={cx+2} y="30" width={cw-4} height="12" rx="3" fill={`${col.color}22`}/>
              <text x={cx+cw/2} y="38" fontSize="6" fill={col.color} fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{col.label}</text>
              <rect x={cx+2} y="46" width={cw-4} height="32" rx="4" fill={`${col.color}11`} stroke={`${col.color}44`} strokeWidth=".8"/>
              <text x={cx+cw/2} y="56" fontSize="6" fill={col.color} fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{col.id}</text>
              <text x={cx+cw/2} y="65" fontSize="5" fill={uiTxt} textAnchor="middle" fontFamily="sans-serif">{col.item}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id={`dbg${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#021544"/><stop offset="100%" stopColor="#0a1f3d"/></linearGradient></defs>
      <rect x="2" y="2" width={w-4} height={h-4} rx="14" fill="#1a2744" stroke="#2a3a6a" strokeWidth="2"/>
      <rect x="10" y="10" width={w-20} height={h-20} rx="10" fill="#021544"/>
      <rect x="16" y="16" width={w-32} height="20" rx="5" fill="rgba(255,255,255,.04)"/>
      <rect x="22" y="21" width="40" height="8" rx="3" fill="#17a3a3" opacity=".7"/>
      {[0,1,2,3].map(i=>{const cw=Math.round((w-40)/4)-4,cx=16+i*(cw+5);return(<g key={i}><rect x={cx} y="44" width={cw} height="40" rx="6" fill="rgba(255,255,255,.05)" stroke="rgba(23,163,164,.15)" strokeWidth="1"/><rect x={cx+6} y="59" width={cw-30} height="10" rx="3" fill="#17a3a3" opacity={0.3+i*.15}/></g>);})}
      {[0,1,2,3,4,5,6].map(i=>{const bh=10+Math.round(Math.abs(Math.sin(i+1))*18),bx=16+i*Math.round((w*.52)/7);return <rect key={i} x={bx} y={h-32-bh} width={Math.round((w*.52)/8)} height={bh} rx="3" fill="#17a3a3" opacity={0.3+i*.1}/>;} )}
      <text x={w-14} y={h-6} fontSize="7" fill="rgba(255,255,255,.2)" textAnchor="end" fontFamily="sans-serif">qoyod.com</text>
    </svg>
  );
}

/* ─── UI PRIMITIVES ─── */
function Btn({ch,onClick,gold,line,xs,full,dis,style={}}){
  const base={padding:xs?"3px 8px":"9px 16px",borderRadius:xs?5:7,border:"none",fontFamily:"inherit",fontSize:xs?11:12.5,fontWeight:600,cursor:dis?"default":"pointer",opacity:dis?0.35:1,width:full?"100%":"auto",transition:"all .15s",...style};
  if(xs||line)return<button style={{...base,border:"1px solid rgba(1,53,90,.45)",background:"transparent",color:"#6a96aa"}}onClick={onClick}>{ch}</button>;
  if(gold)return<button style={{...base,background:"linear-gradient(135deg,#f5a623,#e8941a)",color:"#03050a"}}onClick={onClick}disabled={dis}>{ch}</button>;
  return<button style={{...base,background:"linear-gradient(135deg,#17a3a3,#13778d)",color:"#fff"}}onClick={onClick}disabled={dis}>{ch}</button>;
}
function Tag({ch,t,g,green,red,style={}}){
  const base={padding:"2px 8px",borderRadius:4,fontSize:10,display:"inline-block",...style};
  if(t)return<span style={{...base,background:"rgba(23,163,164,.1)",color:"#17a3a3",border:"1px solid rgba(23,163,164,.2)"}}>{ch}</span>;
  if(g)return<span style={{...base,background:"rgba(245,166,35,.1)",color:"#f5a623",border:"1px solid rgba(245,166,35,.2)"}}>{ch}</span>;
  if(green)return<span style={{...base,background:"rgba(93,200,122,.07)",color:"#5dc87a",border:"1px solid rgba(93,200,122,.2)"}}>{ch}</span>;
  if(red)return<span style={{...base,background:"rgba(255,100,100,.06)",color:"#f07070",border:"1px solid rgba(255,100,100,.18)"}}>{ch}</span>;
  return<span style={{...base,background:"#0a1f3d",color:"#6a96aa",border:"1px solid rgba(1,53,90,.45)"}}>{ch}</span>;
}
function Seg({ch,on,onClick,gold}){
  return<button onClick={onClick} style={{padding:"4px 11px",borderRadius:5,fontFamily:"inherit",fontSize:11,cursor:"pointer",transition:"all .15s",border:`1px solid ${on?(gold?"rgba(245,166,35,.4)":"rgba(23,163,164,.5)"):"rgba(1,53,90,.45)"}`,background:on?(gold?"rgba(245,166,35,.1)":"rgba(23,163,164,.1)"):"transparent",color:on?(gold?"#f5a623":"#17a3a3"):"#8aafc4",fontWeight:on?600:400}}>{ch}</button>;
}
function Fld({label,children,style={}}){
  return<div style={{marginBottom:12,...style}}><label style={{display:"block",fontSize:10,fontWeight:600,color:"#2e5468",marginBottom:4,letterSpacing:".04em",textTransform:"uppercase"}}>{label}</label>{children}</div>;
}
function SBar({v}){
  const col=v>=80?"#5dc87a":v>=60?"#f5a623":v>=40?"#17a3a3":"#f07070";
  return<div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}><div style={{flex:1,height:3,borderRadius:2,background:"rgba(255,255,255,.05)",overflow:"hidden"}}><div style={{height:"100%",width:`${v}%`,background:col,borderRadius:2}}/></div><span style={{fontSize:10,fontWeight:700,color:col,minWidth:26}}>{v}%</span></div>;
}
function Loader({msg}){return<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 20px",gap:12}}><div style={{width:26,height:26,borderRadius:"50%",border:"2px solid rgba(1,53,90,.45)",borderTopColor:"#17a3a3",animation:"qspin .7s linear infinite"}}/><p style={{fontSize:11.5,color:"#2e5468"}}>{msg}</p></div>;}
function Hook({text}){return<div style={{padding:"10px 12px",background:"rgba(245,166,35,.05)",borderRight:"3px solid #f5a623",borderRadius:"0 7px 7px 0",marginBottom:10}}><p style={{fontSize:13,fontWeight:600,color:"#f5a623",lineHeight:1.6,direction:"rtl",margin:0}}>{text}</p></div>;}
function ErrBox({msg}){if(!msg)return null;return<div style={{padding:"8px 12px",borderRadius:7,background:"rgba(255,100,100,.06)",border:"1px solid rgba(255,100,100,.2)",color:"#f07070",fontSize:11,marginBottom:10}}>{msg}</div>;}
function DateLabel({started,isPaid}){
  if(!started)return<span style={{fontSize:9,color:"#2e5468"}}>No date</span>;
  const d=new Date(typeof started==="number"?started*1000:started);
  if(isNaN(d.getTime()))return<span style={{fontSize:9,color:"#2e5468"}}>No date</span>;
  const daysAgo=Math.floor((Date.now()-d.getTime())/86400000);
  const label=daysAgo===0?"Today":daysAgo===1?"Yesterday":`${daysAgo}d ago`;
  const dateStr=d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"});
  return<span style={{fontSize:9,color:"#6a96aa",whiteSpace:"nowrap"}}>📅 {dateStr} · {label}{isPaid&&daysAgo>0?<span style={{color:"#f5a623"}}> ({daysAgo}d running)</span>:null}</span>;
}
function Hr(){return<hr style={{border:"none",borderTop:"1px solid rgba(1,53,90,.45)",margin:"12px 0"}}/>;}
function Row({label,val}){if(val===undefined||val===null||val==="")return null;return<div style={{marginBottom:7,direction:"rtl",textAlign:"right"}}><p style={{fontSize:9.5,color:"#2e5468",marginBottom:2,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</p><p style={{fontSize:12,color:"#ddeef4",lineHeight:1.6}}>{val}</p></div>;}

const card={background:"#071630",border:"1px solid rgba(1,53,90,.45)",borderRadius:10,overflow:"hidden",marginBottom:10};
const cHead={padding:"11px 14px",borderBottom:"1px solid rgba(1,53,90,.45)",display:"flex",alignItems:"center",justifyContent:"space-between"};
const cBody={padding:14};
const row2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:10};

/* ─── GROUPED PRODUCT PICKER ─── */
const PRODUCT_GROUPS=[
  {key:"core",    ar:"المنتجات الأساسية",  en:"Core Products"},
  {key:"segment", ar:"شرائح العملاء",      en:"Audience"},
  {key:"service", ar:"الخدمات",            en:"Services"},
  {key:"offer",   ar:"العروض الموسمية",    en:"Seasonal Offers"},
];

function GroupedProductPicker({selected,onSelect,lang,extras=[],onToggleExtra=()=>{}}){
  const T=(a,e)=>lang==="ar"?a:e;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {PRODUCT_GROUPS.map(grp=>{
        const items=PRODUCTS.filter(p=>p.g===grp.key);
        const isCore=grp.key==="core";
        return(
          <div key={grp.key}>
            <div style={{fontSize:9,fontWeight:700,color:"#2e5468",textTransform:"uppercase",letterSpacing:".06em",marginBottom:5,direction:"rtl",textAlign:"right"}}>
              {T(grp.ar,grp.en)}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {items.map(p=>{
                const on=isCore?selected===p.v:extras.includes(p.v);
                const label=lang==="ar"?p.ar:p.v;
                return(
                  <button key={p.v} onClick={()=>isCore?onSelect(p.v):onToggleExtra(p.v)} style={{
                    padding:"5px 11px",borderRadius:5,cursor:"pointer",
                    fontFamily:"inherit",fontSize:11,fontWeight:on?700:500,
                    border:`1px solid ${on?p.color+"80":"rgba(1,53,90,.45)"}`,
                    background:on?p.color+"18":"#0a1f3d",
                    color:on?p.color:"#6a96aa",
                    transition:"all .15s",whiteSpace:"nowrap"
                  }}>
                    {label.split("—")[0].trim()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* compact chip variant used in Brief / LP tabs */
function GroupedProductChips({selected,onSelect,lang,extras=[],onToggleExtra=()=>{}}){
  const T=(a,e)=>lang==="ar"?a:e;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {PRODUCT_GROUPS.map(grp=>{
        const items=PRODUCTS.filter(p=>p.g===grp.key);
        const isCore=grp.key==="core";
        return(
          <div key={grp.key} style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:8.5,fontWeight:700,color:"#2e5468",whiteSpace:"nowrap",direction:"rtl"}}>{T(grp.ar,grp.en)}:</span>
            {items.map(p=>{
              const on=isCore?selected===p.v:extras.includes(p.v);
              const label=lang==="ar"?p.ar.split("—")[0].trim():(p.v.length>12?p.v.slice(0,10)+"…":p.v);
              return(
                <button key={p.v} onClick={()=>isCore?onSelect(p.v):onToggleExtra(p.v)} style={{
                  padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",
                  fontSize:10,fontWeight:on?700:400,
                  border:`1px solid ${on?p.color+"70":"rgba(1,53,90,.35)"}`,
                  background:on?p.color+"15":"#0a1f3d",
                  color:on?p.color:"#5a8090",transition:"all .12s",whiteSpace:"nowrap"
                }}>
                  {label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─── API ─── */
/* CHANGED: now calls our own /api/generate backend instead of Anthropic directly.
   This keeps the API key secret on the server. */
/* Extract the first balanced {...} block from text. Robust to commentary
   before/after the JSON, braces inside strings, and Claude's occasional
   "Here's the JSON: {...}\n\nNote: ..." pattern. */
function extractFirstJsonObject(text){
  let depth=0,start=-1,inStr=false,esc=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(esc){esc=false;continue;}
    if(c==="\\"){esc=true;continue;}
    if(c==='"'){inStr=!inStr;continue;}
    if(inStr)continue;
    if(c==="{"){if(depth===0)start=i;depth++;}
    else if(c==="}"){depth--;if(depth===0&&start!==-1)return text.slice(start,i+1);}
  }
  return null;
}

// Fetch with timeout via AbortController. Throws "Request timed out" on timeout
// instead of leaving the UI hung forever.
async function fetchWithTimeout(url,opts={},timeoutMs=180000){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    return await fetch(url,{...opts,signal:ctrl.signal});
  }catch(e){
    if(e.name==="AbortError")throw new Error(`Request timed out after ${Math.round(timeoutMs/1000)}s`);
    throw e;
  }finally{clearTimeout(id);}
}

// Reliable AI call. The server already retries Anthropic 429/529/5xx with
// exponential backoff, so the client only needs to handle:
//   - JSON truncation (auto-retry with +50% tokens)
//   - Network failures (one retry after 1s)
//   - Timeouts (180s hard cap)
async function callAI(sys,usr,max_tokens=1400,raw_text=false,_retrying=false){
  let res;
  try{
    res=await fetchWithTimeout("/api/generate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system:sys,user:usr,max_tokens,json_mode:!raw_text})
    },180000);
  }catch(networkErr){
    // One retry on network failure (server restart, brief connectivity loss)
    if(!_retrying){
      await new Promise(r=>setTimeout(r,1000));
      return callAI(sys,usr,max_tokens,raw_text,true);
    }
    throw networkErr;
  }
  if(!res.ok){
    const e=await res.json().catch(()=>({}));
    throw new Error(e?.error||`Error ${res.status}`);
  }
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  const text=(d.content||[]).map(b=>b.text||"").join("").trim();
  if(raw_text)return text;
  const clean=text.replace(/```json\n?|\n?```/g,"").trim();
  // 1st: direct parse
  try{return JSON.parse(clean);}catch{}
  // 2nd: extract first balanced {…} block
  const block=extractFirstJsonObject(clean);
  if(block){try{return JSON.parse(block);}catch{}}
  // 3rd: slice first { to last } (handles truncation)
  const fi=clean.indexOf("{"),li=clean.lastIndexOf("}");
  if(fi!==-1&&li>fi){try{return JSON.parse(clean.slice(fi,li+1));}catch{}}
  // 4th: auto-retry with 50% more tokens (once)
  if(!_retrying){
    const boosted=Math.min(Math.round(max_tokens*1.5),8000);
    return callAI(sys,usr,boosted,false,true);
  }
  throw new Error(`AI did not return valid JSON (${max_tokens} tokens, len=${clean.length})`);
}

/* ─── APP ─── */
export default function CreativeOS(){
  const[lang,setLang]=useState("ar");
  const[tab,setTab]=useState("content");
  const[aiHealth,setAiHealth]=useState(null); // {ok, provider, latency_ms, degraded?}

  // Probe AI health on mount + every 5 min. Shows a banner if degraded.
  useEffect(()=>{
    let cancelled=false;
    const probe=async()=>{
      try{
        const r=await fetch("/api/ai-health");
        if(!r.ok)return;
        const j=await r.json();
        if(!cancelled)setAiHealth(j);
      }catch{/* silent — health probe failure is non-fatal */}
    };
    probe();
    const id=setInterval(probe,5*60*1000);
    return()=>{cancelled=true;clearInterval(id);};
  },[]);

  const[prod,setProd]=useState("Qoyod Main");
  const[prodExtras,setProdExtras]=useState([]);
  const[funnel,setFunnel]=useState("TOF");
  const[chans,setChans]=useState(["Instagram"]);
  const toggleChan=useCallback(v=>setChans(prev=>prev.includes(v)?(prev.length>1?prev.filter(c=>c!==v):prev):([...prev,v])),[]);
  const chan=chans[0]; // backward-compat alias for single-channel paths
  const[crMulti,setCrMulti]=useState({});
  const[fmt,setFmt]=useState("Static");
  const[sector,setSector]=useState("General");
  const[hookType,setHookType]=useState("Fear");
  const[featFocus,setFeatFocus]=useState("");
  const[contentICP,setContentICP]=useState("");
  const[campRef,setCampRef]=useState("");
  const[extraNote,setExtraNote]=useState("");
  const[cr,setCr]=useState(null);
  const[cl,setCl]=useState(false);
  const[ce,setCe]=useState("");
  const[pvRatio,setPvRatio]=useState("1:1");
  const[variantCount,setVariantCount]=useState(1); // 1 = single, 2-5 = multi-variant
  const[abConceptCt,setAbConceptCt]=useState("");

  const[campType,setCampType]=useState("Seasonal");
  const[campTheme,setCampTheme]=useState("");
  const[campObj,setCampObj]=useState("Leads");
  const[campChs,setCampChs]=useState(["Meta","TikTok","Snapchat"]);
  const[campCtx,setCampCtx]=useState("");
  const[campBudget,setCampBudget]=useState("");
  const[campDuration,setCampDuration]=useState("4");
  const[campScope,setCampScope]=useState("Saudi Arabia");
  const[campRes,setCampRes]=useState(null);
  const[campLd,setCampLd]=useState(false);
  const[campErr,setCampErr]=useState("");

  const[mComp,setMComp]=useState("");
  const[mChan,setMChan]=useState("Instagram");
  const[mDesc,setMDesc]=useState("");
  const[mRes,setMRes]=useState(null);
  const[mLd,setMLd]=useState(false);
  const[mErr,setMErr]=useState("");
  const[ilog,setIlog]=useState([]);
  const[liveAds,setLiveAds]=useState([]);
  const[liveAdsLd,setLiveAdsLd]=useState(false);
  const[liveAdsErr,setLiveAdsErr]=useState("");
  const[liveAdsBillingLimit,setLiveAdsBillingLimit]=useState(false);

  /* ── Agent Dashboard ── */
  const[agentStatus,setAgentStatus]=useState(null);       // GET /api/agent/status
  const[agentTasks,setAgentTasks]=useState([]);            // GET /api/agent/tasks
  const[agentPersonas,setAgentPersonas]=useState([]);      // GET /api/agent/personas
  const[agentSchedules,setAgentSchedules]=useState([]);    // GET /api/agent/schedules
  const[agentCtx,setAgentCtx]=useState(null);             // GET /api/competitor-ads/context
  const[agentPatStats,setAgentPatStats]=useState(null);   // GET /api/hypothesis/stats
  const[agentRunPrompt,setAgentRunPrompt]=useState("");
  const[agentRunPersona,setAgentRunPersona]=useState("orchestrator");
  const[agentRunning,setAgentRunning]=useState(false);
  const[agentRunErr,setAgentRunErr]=useState("");
  const[agentRunResult,setAgentRunResult]=useState(null);
  const[agentExpandedTask,setAgentExpandedTask]=useState(null);
  const[agentTaskDetail,setAgentTaskDetail]=useState(null);

  // Fetch agent dashboard data when tab is opened
  useEffect(()=>{
    if(tab!=="agent")return;
    let cancelled=false;
    const fetchAll=async()=>{
      try{
        const[st,tk,pe,sc,cx,ps]=await Promise.allSettled([
          fetch("/api/agent/status").then(r=>r.json()),
          fetch("/api/agent/tasks?").then(r=>r.json()),
          fetch("/api/agent/personas").then(r=>r.json()),
          fetch("/api/agent/schedules").then(r=>r.json()),
          fetch("/api/competitor-ads/context").then(r=>r.json()),
          fetch("/api/hypothesis/stats").then(r=>r.json()),
        ]);
        if(cancelled)return;
        if(st.status==="fulfilled")setAgentStatus(st.value);
        if(tk.status==="fulfilled")setAgentTasks(tk.value?.tasks||[]);
        if(pe.status==="fulfilled")setAgentPersonas(pe.value?.personas||[]);
        if(sc.status==="fulfilled")setAgentSchedules(sc.value?.schedules||sc.value||[]);
        if(cx.status==="fulfilled")setAgentCtx(cx.value);
        if(ps.status==="fulfilled")setAgentPatStats(ps.value);
      }catch{/* silent */}
    };
    fetchAll();
    // Poll tasks faster when any are active
    const pollTasks=async()=>{
      try{
        const[st,tk]=await Promise.all([
          fetch("/api/agent/status").then(r=>r.json()),
          fetch("/api/agent/tasks").then(r=>r.json()),
        ]);
        if(!cancelled){setAgentStatus(st);setAgentTasks(tk?.tasks||[]);}
      }catch{/* silent */}
    };
    const active=()=>agentTasks.some(t=>t.status==="running"||t.status==="thinking"||t.status==="queued");
    const id=setInterval(()=>pollTasks(),active()?3000:12000);
    return()=>{cancelled=true;clearInterval(id);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);

  const runAgent=useCallback(async()=>{
    if(!agentRunPrompt.trim())return;
    setAgentRunning(true);setAgentRunErr("");setAgentRunResult(null);
    try{
      const r=await fetch("/api/agent/run",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title:agentRunPrompt.slice(0,80),body:agentRunPrompt,persona:agentRunPersona,source:"ui"}),
      });
      const j=await r.json();
      if(j.task_id){
        setAgentRunResult({task_id:j.task_id});
        setAgentRunPrompt("");
        // Refresh tasks immediately
        const tk=await fetch("/api/agent/tasks").then(r2=>r2.json());
        setAgentTasks(tk?.tasks||[]);
      } else setAgentRunErr(j.error||"Unknown error");
    }catch(e){setAgentRunErr(String(e));}
    setAgentRunning(false);
  },[agentRunPrompt,agentRunPersona]);

  const loadTaskDetail=useCallback(async(id)=>{
    if(agentExpandedTask===id){setAgentExpandedTask(null);setAgentTaskDetail(null);return;}
    setAgentExpandedTask(id);setAgentTaskDetail(null);
    try{
      const r=await fetch(`/api/agent/tasks/${id}`);
      const j=await r.json();
      setAgentTaskDetail(j);
    }catch{/* silent */}
  },[agentExpandedTask]);

  /* ── Hypothesis logging (D1 — Pattern Library foundation) ── */
  const[hypModalOpen,setHypModalOpen]=useState(false);
  const[hypText,setHypText]=useState("");
  const[hypExpectedLift,setHypExpectedLift]=useState("");
  const[hypLd,setHypLd]=useState(false);
  const[hypMsg,setHypMsg]=useState("");

  const submitHypothesis=useCallback(async()=>{
    if(!hypText.trim()){setHypMsg(T("اكتب الفرضية أولاً","Enter a hypothesis first"));return;}
    setHypLd(true);setHypMsg("");
    try{
      // Generate a master-prompt-style ID: Q-YYYY-Wnn-NNN
      const now=new Date();
      const week=Math.ceil((((now-new Date(now.getFullYear(),0,1))/86400000)+1)/7);
      const id=`Q-${now.getFullYear()}-W${String(week).padStart(2,"0")}-${String(Math.floor(Math.random()*999)).padStart(3,"0")}`;
      const r=await fetchWithTimeout("/api/hypothesis/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,hypothesis:hypText.trim(),expected_lift:hypExpectedLift.trim()||undefined,channel:chans[0],sector,funnel_stage:funnel,verdict:"PENDING"})},15000);
      const j=await r.json();
      if(!r.ok||j.error)throw new Error(j.error||`Error ${r.status}`);
      setHypMsg(T(`✓ تم تسجيل الفرضية: ${id}`,`✓ Logged: ${id}`));
      setHypText("");setHypExpectedLift("");
      setTimeout(()=>{setHypModalOpen(false);setHypMsg("");},1800);
    }catch(e){setHypMsg(`⚠ ${e.message}`);}finally{setHypLd(false);}
  },[hypText,hypExpectedLift,chans,sector,funnel,lang]);



  const[driveLd,setDriveLd]=useState({});
  const[driveLinks,setDriveLinks]=useState({});
  const[driveErrs,setDriveErrs]=useState({});
  /* (Nano-Banana SVG refinement removed with the new design pipeline.) */
  const[advContent,setAdvContent]=useState(false);
  const[customPersonas,setCustomPersonas]=useState([]);
  const[newPersona,setNewPersona]=useState({title:"",en:"",icon:"👤",tier:"A",pain_ar:"",hook_ar:"",funnel:"TOF",channels:[]});
  const[showAddPersona,setShowAddPersona]=useState(false);

  /* ── Content Calendar ── */
  const[calProd,setCalProd]=useState("Qoyod Main");
  const[calExtras,setCalExtras]=useState([]);
  const[calMonth,setCalMonth]=useState("مايو 2025");
  const[calPlatforms,setCalPlatforms]=useState(["Instagram","TikTok","Snapchat"]);
  const[calFreq,setCalFreq]=useState("3 posts/week");
  const[calGoal,setCalGoal]=useState("Awareness + Leads");
  const[calRes,setCalRes]=useState(null);
  const[calLd,setCalLd]=useState(false);
  const[calErr,setCalErr]=useState("");

  /* ── A/B Variants ── */
  const[abProd,setAbProd]=useState("Qoyod Main");
  const[abConcept,setAbConcept]=useState("");
  const[abChan,setAbChan]=useState("Instagram");
  const[abFmt,setAbFmt]=useState("Static");
  const[abAud,setAbAud]=useState("TOF");
  const[abRes,setAbRes]=useState(null);
  const[abLd,setAbLd]=useState(false);
  const[abErr,setAbErr]=useState("");

  /* ── Email / WhatsApp Sequences ── */
  const[seqProd,setSeqProd]=useState("Qoyod Main");
  const[seqType,setSeqType]=useState("welcome");
  const[seqSteps,setSeqSteps]=useState(3);
  const[seqChannel,setSeqChannel]=useState("email");
  const[seqRes,setSeqRes]=useState(null);
  const[seqLd,setSeqLd]=useState(false);
  const[seqErr,setSeqErr]=useState("");


  /* ── Ad Spec Sheet ── */
  const[specProd,setSpecProd]=useState("Qoyod Main");
  const[specPlatforms,setSpecPlatforms]=useState(["Meta","TikTok","Snapchat","Google"]);
  const[specGoal,setSpecGoal]=useState("Leads");
  const[specRes,setSpecRes]=useState(null);
  const[specLd,setSpecLd]=useState(false);
  const[specErr,setSpecErr]=useState("");

  const T=(ar,en)=>lang==="en"?en:ar;
  const dir=lang==="ar"?"rtl":"ltr";
  const pctx=PRODUCTS.find(p=>p.v===prod)||PRODUCTS[0];

  useEffect(()=>{
    fetch(`/api/wp-config`).then(r=>r.ok?r.json():null).then(d=>{
      if(!d)return;
      if(d.siteUrl)setWpUrl(d.siteUrl);
      if(d.username)setWpUser(d.username);
      if(d.configured)setWpConfigured(true);
    }).catch(()=>{});
    fetch(`/api/hs-config`).then(r=>r.ok?r.json():null).then(d=>{
      if(d?.configured)setHsConfigured(true);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(document.getElementById("qcss"))return;
    const el=document.createElement("style");el.id="qcss";
    el.textContent=`@keyframes qspin{to{transform:rotate(360deg)}}@keyframes qrise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}.qa{animation:qrise .25s ease both}input,textarea,select{width:100%;padding:7px 10px;background:rgba(7,22,48,.7);border:1px solid rgba(1,53,90,.45);border-radius:7px;color:#ddeef4;font-family:inherit;font-size:12.5px;outline:none;transition:border-color .15s;box-sizing:border-box}input:focus,textarea:focus,select:focus{border-color:rgba(23,163,164,.4);box-shadow:0 0 0 2px rgba(23,163,164,.07)}textarea{resize:vertical;line-height:1.6}select option{background:#0a1f3d}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:rgba(1,53,90,.45);border-radius:2px}`;
    document.head.appendChild(el);
  },[]);

  const copyText=txt=>navigator.clipboard.writeText(txt).catch(()=>{});

  const buildProdCtx=useCallback((primaryProd,extras,lang2)=>{
    const all=[primaryProd,...extras].filter(Boolean);
    const items=all.map(v=>PRODUCTS.find(p=>p.v===v)).filter(Boolean);
    const desc=items.map(p=>lang2==="en"?p.desc_en:p.desc_ar).join(" | ");
    const names=items.map(p=>lang2==="en"?p.v:(p.ar||p.v).split("—")[0].trim()).join(" + ");
    return{names,desc};
  },[]);

  const toggleExtra=useCallback((v,setExtras)=>{
    const grp=PRODUCTS.find(p=>p.v===v)?.g;
    setExtras(prev=>{
      const filtered=prev.filter(x=>PRODUCTS.find(p=>p.v===x)?.g!==grp);
      return prev.includes(v)?filtered:[...filtered,v];
    });
  },[]);

  /* Build channel-specific prompt spec */
  const chanSpec=(ch)=>{
    if(ch==="Google Ads"){
      const spec=lang==="ar"
        ?"Google Search RSA (Arabic). Saudi dialect. NO emojis. STRICT: each headline ≤30 Arabic chars (count carefully). Each description ≤90 Arabic chars. Write exactly 10 headlines and 4 descriptions."
        :"Google Search RSA (English). NO emojis. STRICT: each headline ≤30 chars (count carefully). Each description ≤90 chars. Write exactly 10 headlines and 4 descriptions.";
      return{spec,fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"google_headlines":["h1","h2","h3","h4","h5","h6","h7","h8","h9","h10"],"google_descriptions":["d1","d2","d3","d4"]}`};
    }
    if(ch==="LinkedIn")return{spec:`LinkedIn professional post. NO emojis. No hashtags. 150-250 words. B2B tone. ${lang==="ar"?"Saudi Arabic dialect.":"English."}`,fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"LinkedIn post 150-250 words, no emojis"}`};
    if(ch==="Twitter/X")return{spec:"Twitter/X post. NO emojis. Max 280 chars. Punchy, direct. 2-3 hashtags.",fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"tweet ≤280 chars, no emojis"}`};
    if(ch==="TikTok")return{spec:"TikTok video caption + script hook. NO emojis. Conversational, trending. 3-5 hashtags.",fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"TikTok caption, no emojis"}`};
    if(ch==="Snapchat")return{spec:"Snapchat ad. NO emojis. Ultra-short, punchy. Max 100 chars visible.",fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"Snapchat caption ≤100 chars, no emojis"}`};
    if(ch==="Facebook")return{spec:"Facebook post. NO emojis. Conversational, 80-160 words. 3-4 hashtags.",fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"Facebook post 80-160 words, no emojis"}`};
    return{spec:`Instagram caption. NO emojis. Engaging, 80-150 words. 4-5 ${lang==="ar"?"Arabic + English":"relevant"} hashtags.`,fmt:`{"ad_copy":{"hook":"...","body":"...","cta":"..."},"caption":"Instagram caption 80-150 words, no emojis"}`};
  };

  const genContent=useCallback(async()=>{
    const ff=FEATURES.find(f=>f.v===featFocus);
    const fctx=ff?(lang==="en"?ff.desc_en:ff.desc_ar):"";
    const icpP=ICP_PERSONAS.find(p=>p.id===contentICP);
    const icpCtx=icpP?`Target ICP: ${icpP.title} — Pain: ${icpP.pain_ar} — Hook angle: ${icpP.hook_ar}`:"";
    const{names:prodNames,desc:prodDesc}=buildProdCtx(prod,prodExtras,lang);
    const ol=lang==="en"?"Write ALL copy in English. Professional, concise.":"Write ALL copy in Saudi dialect ONLY (مو/وش/ليش/يكلفك). NEVER Egyptian (مش/ايه/بتاعك).";
    setCl(true);setCe("");setCr(null);setCrMulti({});
    const results={};
    for(const ch of chans){
      const{spec,fmt}=chanSpec(ch);
      const sys=`Senior performance copywriter for Qoyod — Saudi cloud accounting SaaS, ZATCA-accredited.\n${ol}\n${QOYOD_VOICE}\nProduct: ${prodDesc}\n${fctx?"Feature: "+fctx:""}\n${icpCtx?"ICP: "+icpCtx:""}\nChannel: ${ch}. ${spec}\nRules: ONE clear message per output. ZERO emojis anywhere in the output. Generate ONLY for ${ch}.\nReturn ONLY valid JSON (no markdown):\n${fmt}`;
      const usr=`Products:${prodNames} Channel:${ch} Audience:${funnel} Sector:${sector} Feature:${ff?.ar||"general"} ICP:${icpP?.title||"general"} Note:${extraNote||"none"}`;
      try{results[ch]=await callAI(sys,usr,ch==="Google Ads"?2500:2000);}
      catch(e){results[ch]={error:e.message};}
    }
    setCrMulti(results);
    if(chans.length===1)setCr(results[chans[0]]);
    setCl(false);
  },[lang,prod,prodExtras,chans,funnel,sector,featFocus,contentICP,extraNote,buildProdCtx]);

  const genContentAB=useCallback(async()=>{
    if(!abConceptCt.trim()){setCe(T("اكتب الفكرة أو الرسالة لتوليد النسخ","Enter a concept or message to generate variants"));return;}
    const n=Math.max(2,Math.min(5,variantCount));
    const{names:prodNames,desc:prodDesc}=buildProdCtx(prod,prodExtras,lang);
    const icpP=ICP_PERSONAS.find(p=>p.id===contentICP);
    const icpCtx=icpP?`Target ICP: ${icpP.title} — Pain: ${icpP.pain_ar} — Hook: ${icpP.hook_ar}`:"";
    const ol=lang==="en"?"Write all copy in English.":"Write all Arabic copy in Saudi dialect (مو/وش/ليش). NEVER Egyptian.";
    const labels=["A","B","C","D","E"];
    const variantSchema=Array.from({length:n},(_,i)=>`{"label":"${labels[i]} — [angle name]","ad_copy":{"hook":"...","body":"...","cta":"..."},"google_headlines":["≤30 chars","≤30 chars","≤30 chars"],"captions":{"instagram":"...with hashtags","linkedin":"..."},"predicted_ctr":"high/med/low","why":"..."}`).join(",");
    const sys=`Senior CRO copywriter for Qoyod (Saudi cloud accounting SaaS). ${ol}\n${QOYOD_VOICE}\n${icpCtx?"ICP: "+icpCtx:""}\nProduce EXACTLY ${n} genuinely different variants — each with a different angle, different hook, different trigger. Do not repeat or paraphrase across variants.\nReturn ONLY valid JSON:\n{"variants":[${variantSchema}],"recommendation":"..."}`;
    const usr=`Products:${prodNames} Desc:${prodDesc} Channel:${chans[0]} Audience:${funnel} Sector:${sector} ICP:${icpP?.title||"general"} Variants:${n} Concept:"${abConceptCt}"`;
    // ~1500 tokens per variant (Arabic is verbose), capped at 8000
    const budget=Math.min(1500*n,8000);
    setCl(true);setCe("");setCr(null);setAbRes(null);
    try{setAbRes(await callAI(sys,usr,budget));}catch(e){setCe(e.message);}finally{setCl(false);}
  },[lang,prod,prodExtras,chans,funnel,sector,contentICP,abConceptCt,variantCount,buildProdCtx]);

  const genCampaign=useCallback(async()=>{
    if(!campTheme){setCampErr(T("اكتب موضوع الحملة","Enter a campaign theme"));return;}
    const ol=lang==="en"?"Copy in English.":"Arabic copy in Saudi dialect. Not Egyptian.";
    const budgetCtx=campBudget?`Total budget: ${campBudget} SAR`:"Budget: not specified";
    const adCopiesSchema=campChs.map(c=>`{"channel":"${c}","format":"...","hook":"...","body":"...","cta":"...","trust":"..."}`).join(",");
    const tokenBudget=Math.min(1800+campChs.length*500,7000);
    const sys=`Senior creative director for Qoyod. ${ol}\n${QOYOD_VOICE}\nProduce EXACTLY one ad_copy entry for EACH channel shown in the ad_copies array — no more, no fewer. Return ONLY valid JSON:\n{"campaign_name":"...","core_message":"...","target_stage":"TOF/MOF/BOF","timeline":{"weeks":${campDuration||4},"phases":[{"week":"Week 1-2","focus":"...","action":"..."},{"week":"Week 3-4","focus":"...","action":"..."}]},"hooks":[{"type":"...","text":"...","channel":"...","strength":85},{"type":"...","text":"...","channel":"...","strength":80}],"ad_copies":[${adCopiesSchema}],"budget_split":{${campChs.map(c=>`"${c}":"...%"`).join(",")}},"kpis":["...","...","..."]}`;
    const usr=`Type:${campType} Theme:"${campTheme}" Obj:${campObj} Channels:${campChs.join(",")} Duration:${campDuration} weeks Scope:${campScope} ${budgetCtx} Context:${campCtx||"standard"}`;
    setCampLd(true);setCampErr("");setCampRes(null);
    try{setCampRes(await callAI(sys,usr,tokenBudget));}catch(e){setCampErr(e.message);}finally{setCampLd(false);}
  },[lang,campType,campTheme,campObj,campChs,campCtx,campBudget,campDuration,campScope]);

  const loadLiveAds=useCallback(async(source)=>{
    if(!mComp){setLiveAdsErr(T("اختر منافساً أولاً","Select a competitor first"));return;}
    setLiveAdsLd(true);setLiveAdsErr("");setLiveAdsBillingLimit(false);setLiveAds([]);
    try{
      // Apify scrapers can take 30-60s to spin up — generous timeout
      const r=await fetchWithTimeout("/api/competitor-ads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,competitor:mComp,country:"SA",limit:10})},120000);
      const j=await r.json().catch(()=>({}));
      if(j.billing_limit){
        setLiveAdsBillingLimit(true);
        return;
      }
      if(!r.ok||j.error){
        setLiveAdsErr(j.error||T("فشل تحميل الإعلانات","Failed to load ads"));
        return;
      }
      const newAds=(j.ads||[]).map(a=>({...a,_source:source}));
      // Accumulate results — each button ADDS to the list (filtered by source to avoid dupes on re-click)
      setLiveAds(prev=>[...prev.filter(a=>a._source!==source),...newAds]);
      if(newAds.length===0)setLiveAdsErr(T(`لا توجد نتائج لـ ${mComp} على ${source}`,`No results found for ${mComp} on ${source}`));
    }catch(e){setLiveAdsErr(e.message);}finally{setLiveAdsLd(false);}
  },[mComp,lang]);

  const useLiveAdAsInput=useCallback((ad)=>{
    // Fill the form with the real ad's content. Only use hook + body —
    // 'caption' is overloaded across sources (engagement metrics for FB
    // organic / Snap / TikTok organic, format string for Google, real
    // CTA for paid sources). Hook + body are always real copy.
    const text=[ad.hook,ad.body].filter(Boolean).join("\n").trim();
    if(!text){setMDesc(ad.detail_url||"");setMErr&&setMErr(T("هذا البوست بدون نص — استخدم الرابط للتحليل","No post text — using URL for analysis"));}
    else setMDesc(text);
    // Switch the channel select based on detected platform
    const plats=(ad.platforms||[]).join(" ").toLowerCase();
    if(ad._source==="instagram"||plats.includes("instagram"))setMChan("Instagram");
    else if(ad._source==="facebook"||ad._source==="facebook_organic"||plats.includes("facebook"))setMChan("Facebook");
    else if(ad._source==="tiktok"||ad._source==="tiktok_ads"||plats.includes("tiktok"))setMChan("TikTok");
    else if(ad._source==="snapchat"||plats.includes("snapchat"))setMChan("Snapchat");
    else if(ad._source==="google")setMChan("Google");
  },[]);

  const genCounter=useCallback(async()=>{
    if(!mComp){setMErr(T("اختر المنافس أولاً","Select a competitor first"));return;}
    if(!mDesc){setMErr(T("صف الإعلان أو الصق رابط البوست","Describe the ad or paste the post URL"));return;}
    const ol=lang==="en"?"English":"Saudi Arabic dialect";
    const trimmed=mDesc.trim();
    const isUrl=/^https?:\/\//i.test(trimmed);
    const isLinkedIn=mChan==="LinkedIn";
    setMLd(true);setMErr("");setMRes(null);

    // If input looks like a URL, try to fetch the actual page content first
    // Skip entirely for LinkedIn — always hits login wall
    let realContent="";
    let fetchedFrom=null;
    let blockedNote="";
    if(isUrl&&!isLinkedIn){
      try{
        const fr=await fetchWithTimeout("/api/fetch-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:trimmed})},20000);
        const fj=await fr.json().catch(()=>({}));
        if(fj.ok&&fj.content){
          realContent=fj.content;
          fetchedFrom=fj.host;
        }else if(fj.blocked){
          blockedNote=fj.message||`${fj.platform||"Site"} blocks bots — paste the caption directly.`;
          setMErr(T(`⚠ ${blockedNote} — لكن سنحاول التحليل بناءً على ${mComp} و${mChan}.`,`⚠ ${blockedNote} — analyzing inferred angle for ${mComp} on ${mChan}.`));
        }
      }catch(e){
        console.warn("[market] URL fetch failed, falling back to inferred analysis:",e.message);
      }
    }

    const inputCtx=realContent
      ?`ACTUAL AD CONTENT (fetched from ${fetchedFrom}):\n---\n${realContent}\n---\nAnalyze the REAL ad above. Quote the actual hook/message in your analysis.`
      :isLinkedIn&&!isUrl
      ?`LINKEDIN POST (pasted by analyst):\n---\n${trimmed}\n---\nAnalyze this real LinkedIn post. Quote the actual text in your analysis.`
      :isUrl
      ?`The user provided a URL only (${trimmed}) but it could not be fetched (login wall or blocked). Infer the most likely angle based on what ${mComp} typically posts on ${mChan}. Mark "(inferred)" in why_works.`
      :`The user described the ad in their own words.`;
    const sys=`Qoyod creative strategist. Analyze ONE specific competitor ad and produce ONE Qoyod counter-creative. Counter in ${ol}.\n${QOYOD_VOICE}\n${inputCtx}\nReturn ONLY valid JSON with EXACTLY ONE card matching the competitor selected:\n{"cards":[{"competitor":"${mComp}","platform":"${mChan}","hook":"...","message":"...","why_works":"...","weakness":"...","counter":{"hook_ar":"...","body_ar":"...","trust":"...","cta_ar":"...","funnel":"TOF/MOF/BOF"}}]}`;
    const usr=`Competitor:${mComp}\nChannel:${mChan}\nUserInput:${trimmed}`;

    try{
      const r=await callAI(sys,usr,2500);
      if(Array.isArray(r.cards)){
        const matched=r.cards.filter(c=>(c.competitor||"").toLowerCase().includes(mComp.toLowerCase()));
        r.cards=matched.length?matched:r.cards.slice(0,1);
      }
      if(realContent)r._source=`fetched from ${fetchedFrom}`;
      else if(isLinkedIn&&!isUrl)r._source="LinkedIn post (pasted)";
      else if(isUrl)r._source="inferred (URL not fetchable)";
      else r._source="user description";
      setMRes(r);
      if(r.cards?.[0])setIlog(p=>[{date:new Date().toLocaleDateString(),comp:mComp,ch:mChan,desc:trimmed.slice(0,48)},...p]);
    }catch(e){setMErr(e.message);}finally{setMLd(false);}
  },[lang,mComp,mChan,mDesc]);

  const genAnalysis=useCallback(async()=>{
    if(!mComp){setMErr(T("اختر المنافس أولاً","Select a competitor first"));return;}
    if(!mDesc){setMErr(T("صف الإعلان أو الصق رابط","Paste a URL or describe the content"));return;}
    const trimmed=mDesc.trim();
    const isUrl=/^https?:\/\//i.test(trimmed);
    const isLinkedIn=mChan==="LinkedIn";
    setMLd(true);setMErr("");setMRes(null);
    let realContent="";let fetchedFrom=null;
    // Skip URL fetch for LinkedIn — always hits login wall
    if(isUrl&&!isLinkedIn){
      try{
        const fr=await fetchWithTimeout("/api/fetch-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:trimmed})},20000);
        const fj=await fr.json().catch(()=>({}));
        if(fj.ok&&fj.content){realContent=fj.content;fetchedFrom=fj.host;}
      }catch(e){console.warn("[analysis] fetch failed:",e.message);}
    }
    const inputCtx=realContent
      ?`ACTUAL CONTENT (fetched from ${fetchedFrom}):\n---\n${realContent.slice(0,4000)}\n---`
      :isLinkedIn&&!isUrl
      ?`LINKEDIN POST TEXT (pasted by analyst):\n---\n${trimmed}\n---\nAnalyze this real LinkedIn post content.`
      :`Input: ${trimmed}`;
    const sys=`You are a competitive intelligence analyst for Qoyod (Saudi cloud accounting SaaS).\n${inputCtx}\nAnalyze the competitor's content or website DEEPLY. Write in Saudi Arabic dialect.\nReturn ONLY valid JSON:\n{"_mode":"analyze","competitor":"${mComp}","platform":"${mChan}","summary":"2-sentence summary of what they're doing","hook":"their main hook or headline","angle":"fear|authority|social_proof|offer|aspiration|comparison","target_audience":"who they're targeting","strengths":["strength 1","strength 2"],"gaps":["gap Qoyod can exploit 1","gap 2"],"keywords":["key terms they use"],"funnel_stage":"TOF/MOF/BOF","qoyod_angle":"how Qoyod should position against this specifically"}`;
    const usr=`Competitor:${mComp} Channel:${mChan} URL/Input:${trimmed}`;
    try{
      const r=await callAI(sys,usr,2000);
      r._mode="analyze";
      r._source=realContent?`fetched from ${fetchedFrom}`:isLinkedIn?"LinkedIn post (pasted)":isUrl?"inferred":"user input";
      setMRes(r);
    }catch(e){setMErr(e.message);}finally{setMLd(false);}
  },[lang,mComp,mChan,mDesc]);

  /* ── Content Calendar ── */
  const genCalendar=useCallback(async()=>{
    if(!calPlatforms.length){setCalErr(T("اختر منصة واحدة على الأقل","Select at least one platform"));return;}
    const px=PRODUCTS.find(p=>p.v===calProd)||PRODUCTS[0];
    const ol=lang==="en"?"All captions in English.":"All captions in Saudi Arabic dialect (مو/وش/ليش). NEVER Egyptian.";
    const refCopy=`Reference captions from real Qoyod campaigns:\n- "سهل إدارة أعمالك بنظام فواتير ذكي وأصدر فواتيرك الإلكترونية من جوالك مع قيود"\n- "ركّز على نمو مشروعك واترك تعقيد الحسابات علينا — SOCPA certified"\n- "آلاف التجار دخلوا المرحلة الثانية للفوترة الإلكترونية مع قيود، أنت جاهز؟"\nUse these as tone/style benchmark.`;
    const postsPerMonth=({"daily":30,"5 posts/week":20,"4 posts/week":16,"3 posts/week":12,"2 posts/week":8,"1 post/week":4})[calFreq]||12;
    const sys=`You are a social media content strategist for Qoyod (Saudi cloud accounting SaaS, ZATCA-certified). ${ol}\n${QOYOD_VOICE}\n${refCopy}\nIMPORTANT: Each post is on ONE platform only. Distribute the ${postsPerMonth} posts across the selected platforms (rotate them — do NOT generate the same post on every platform). Captions ≤80 words each. Themes ≤5 words each.\nReturn ONLY valid JSON:\n{"month":"...","goal":"...","total_posts":${postsPerMonth},"weeks":[{"week":1,"posts":[{"day":"...","platform":"...","format":"Static/Reel/Story/Carousel","topic":"...","design_text":"...","caption":"...","hashtags":"...","cta":"...","funnel_stage":"TOF/MOF/BOF"}]}],"themes":["..."],"hashtag_sets":{"main":"...","secondary":"..."}}`;
    const extraProds=calExtras.map(v=>PRODUCTS.find(p=>p.v===v)).filter(Boolean);
    const extraCtx=extraProds.length?` | Also highlight: ${extraProds.map(p=>lang==="en"?p.v:p.ar).join(", ")}`:"";
    const usr=`Product:${calProd} Desc:${lang==="en"?px.desc_en:px.desc_ar}${extraCtx} Month:${calMonth} Platforms:${calPlatforms.join(",")} (${calPlatforms.length} platforms — rotate posts across them) Frequency:${calFreq} (${postsPerMonth} posts total) Goal:${calGoal}`;
    const budget=Math.min(Math.max(2500,postsPerMonth*150+calPlatforms.length*250+1500),8000);
    setCalLd(true);setCalErr("");setCalRes(null);
    try{setCalRes(await callAI(sys,usr,budget));}catch(e){setCalErr(e.message);}finally{setCalLd(false);}
  },[lang,calProd,calExtras,calMonth,calPlatforms,calFreq,calGoal]);

  /* ── A/B Variants ── */
  const genAB=useCallback(async()=>{
    if(!abConcept){setAbErr(T("اكتب الفكرة أو الرسالة أولاً","Enter a concept or message first"));return;}
    const px=PRODUCTS.find(p=>p.v===abProd)||PRODUCTS[0];
    const ol=lang==="en"?"Write all copy in English.":"Write all Arabic copy in Saudi dialect (مو/وش/ليش). NEVER Egyptian.";
    const sys=`Senior CRO copywriter for Qoyod (Saudi cloud accounting SaaS). ${ol}\n${QOYOD_VOICE}\nProduce two genuinely different A/B variants — different angle, different hook type, different emotional trigger.\nReturn ONLY valid JSON:\n{"concept_summary":"...","variant_a":{"label":"A — [angle name]","hook":"...","headline":"...","body":"...","cta":"...","trust":"...","hook_type":"...","emotional_trigger":"...","predicted_ctr":"high/med/low","why":"..."},"variant_b":{"label":"B — [angle name]","hook":"...","headline":"...","body":"...","cta":"...","trust":"...","hook_type":"...","emotional_trigger":"...","predicted_ctr":"high/med/low","why":"..."},"recommendation":"...","testing_note":"..."}`;
    const usr=`Product:${abProd} Desc:${lang==="en"?px.desc_en:px.desc_ar} Channel:${abChan} Format:${abFmt} Audience:${abAud} Concept:"${abConcept}"`;
    setAbLd(true);setAbErr("");setAbRes(null);
    try{setAbRes(await callAI(sys,usr,2500));}catch(e){setAbErr(e.message);}finally{setAbLd(false);}
  },[lang,abProd,abConcept,abChan,abFmt,abAud]);

  /* ── Email / WhatsApp Sequences ── */
  const genSeq=useCallback(async()=>{
    const px=PRODUCTS.find(p=>p.v===seqProd)||PRODUCTS[0];
    const ol=lang==="en"?"Write all copy in English.":"Write all Arabic copy in Saudi dialect. NEVER Egyptian.";
    const typeLabel={"welcome":"Welcome series","nurture":"Nurture series","winback":"Win-back series","demo":"Post-demo follow-up","announcement":"Feature announcement"}[seqType]||seqType;
    const channelNote=seqChannel==="whatsapp"?"Messages must be short (max 3 lines each), conversational, no bullet lists, include one link placeholder [LINK].":seqChannel==="sms"?"SMS: max 160 chars per message, ultra-brief.":"Email: subject line + preview text + body (3-6 sentences) + CTA button label.";
    const sys=`You are a B2B lifecycle marketing specialist for Qoyod. ${ol}\n${QOYOD_VOICE}\n${channelNote}\nSequence type: ${typeLabel}\nReturn ONLY valid JSON:\n{"sequence_name":"...","channel":"${seqChannel}","type":"${seqType}","messages":[{"step":1,"send_timing":"...","subject":"...","preview_text":"...","body":"...","cta":"...","goal":"...","tone":"..."}]}`;
    const usr=`Product:${seqProd} Desc:${lang==="en"?px.desc_en:px.desc_ar} Steps:${seqSteps} Channel:${seqChannel} Type:${seqType}`;
    setSeqLd(true);setSeqErr("");setSeqRes(null);
    try{setSeqRes(await callAI(sys,usr,3500));}catch(e){setSeqErr(e.message);}finally{setSeqLd(false);}
  },[lang,seqProd,seqType,seqSteps,seqChannel]);

  /* ── Ad Spec Sheet ── */
  const genSpec=useCallback(async()=>{
    const px=PRODUCTS.find(p=>p.v===specProd)||PRODUCTS[0];
    const ol=lang==="en"?"Respond in English.":"Respond in Arabic with English tech terms where standard.";
    const sys=`You are a performance creative strategist for Qoyod. ${ol}\nGenerate a complete ad creative spec sheet for the selected platforms and product.\nReturn ONLY valid JSON:\n{"product":"...","goal":"...","platforms":[{"platform":"...","formats":[{"format":"...","dimensions":"...","aspect_ratio":"...","text_limit":"...","creative_direction":"...","dos":["..."],"donts":["..."]}]}],"global_dos":["..."],"global_donts":["..."]}`;
    const usr=`Product:${specProd} Desc:${lang==="en"?px.desc_en:px.desc_ar} Platforms:${specPlatforms.join(",")} Goal:${specGoal}`;
    setSpecLd(true);setSpecErr("");setSpecRes(null);
    try{setSpecRes(await callAI(sys,usr,3500));}catch(e){setSpecErr(e.message);}finally{setSpecLd(false);}
  },[lang,specProd,specPlatforms,specGoal]);


  const TABS=[
    ["content", T("إنشاء محتوى","Content")],
    ["campaign",T("حملة","Campaign")],
    ["calendar",T("خطة المحتوى","Calendar")],
    ["email",   T("رسائل / بريد","Email & WA")],
    ["market",  T("مراقبة السوق","Market Watch")],
    ["library", T("مكتبة الإعلانات","Ad Library")],
    ["icp",     T("شرائح العملاء","ICP")],
    ["agent",   T("مركز التحكم","Agent Dashboard")],
  ];

  const SH=({title,sub})=><div style={{marginBottom:15,paddingBottom:11,borderBottom:"1px solid rgba(1,53,90,.45)"}}><h2 style={{fontSize:13.5,fontWeight:700,marginBottom:2}}>{title}</h2><p style={{fontSize:11,color:"#2e5468"}}>{sub}</p></div>;

  return(
    <div style={{background:"#020c1e",color:"#ddeef4",fontFamily:"'Segoe UI',Helvetica,sans-serif",minHeight:"100vh",direction:dir}}>
      <div style={{position:"fixed",width:460,height:460,borderRadius:"50%",background:"rgba(2,21,68,.5)",top:-140,right:-70,filter:"blur(88px)",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",width:260,height:260,borderRadius:"50%",background:"rgba(23,163,164,.05)",bottom:0,left:-45,filter:"blur(75px)",pointerEvents:"none",zIndex:0}}/>

      <div style={{position:"sticky",top:0,zIndex:100,height:52,padding:"0 18px",borderBottom:"1px solid rgba(1,53,90,.45)",background:"rgba(2,12,30,.96)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#17a3a3,#13778d)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff"}}>Q</div>
          <div>
            <div style={{fontSize:12.5,fontWeight:700}}>Somaa Content Agent</div>
            <div style={{fontSize:9.5,color:"#2e5468",marginTop:1}}>{T("وكيل المحتوى الذكي","AI Content Agent")}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",background:"#0a1f3d",border:"1px solid rgba(1,53,90,.45)",borderRadius:6,overflow:"hidden",height:26}}>
            {["ar","en"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"0 10px",height:"100%",background:lang===l?"rgba(23,163,164,.1)":"none",border:"none",color:lang===l?"#17a3a3":"#2e5468",fontSize:10.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{l.toUpperCase()}</button>)}
          </div>
<div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(23,163,164,.12)",fontSize:9.5,color:"#2e5468"}}>
            <div style={{width:4,height:4,borderRadius:"50%",background:"#17a3a3"}}/>LIVE
          </div>
        </div>
      </div>
      <div style={{position:"sticky",top:52,zIndex:99,display:"flex",padding:"0 18px",borderBottom:"1px solid rgba(1,53,90,.45)",background:"rgba(2,12,30,.92)",backdropFilter:"blur(10px)",overflowX:"auto"}}>
        {TABS.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"0 14px",height:42,fontSize:11.5,fontFamily:"inherit",fontWeight:tab===k?600:500,color:tab===k?"#17a3a3":"#2e5468",background:"none",border:"none",borderBottom:`2px solid ${tab===k?"#17a3a3":"transparent"}`,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>{l}</button>)}
      </div>

      {aiHealth&&aiHealth.degraded&&(
        <div style={{padding:"7px 18px",background:aiHealth.fallback_available?"rgba(245,166,35,.08)":"rgba(240,112,112,.08)",borderBottom:`1px solid ${aiHealth.fallback_available?"rgba(245,166,35,.3)":"rgba(240,112,112,.3)"}`,display:"flex",alignItems:"center",gap:8,fontSize:10.5,direction:dir}}>
          <span style={{fontSize:11}}>{aiHealth.fallback_available?"⚠":"⛔"}</span>
          <span style={{color:aiHealth.fallback_available?"#f5a623":"#f07070",fontWeight:600}}>
            {aiHealth.fallback_available
              ? T("الخدمة الأساسية بطيئة — يستخدم النظام مزود احتياطي (Gemini)","Primary AI is degraded — using fallback (Gemini)")
              : T("خدمة الذكاء الاصطناعي غير متاحة حالياً — حاول بعد 5 دقائق","AI service unavailable — try again in 5 min")}
          </span>
        </div>
      )}

      <div style={{maxWidth:840,margin:"0 auto",padding:"20px 16px 60px"}}>

        {tab==="content"&&(
          <div className="qa">
            <SH title={T("إنشاء المحتوى الإعلاني","Ad Content Generator")} sub={T("نص + UGC + معاينة بصرية","Copy + UGC + visual preview")}/>
            <ErrBox msg={ce}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعدادات الإعلان","Ad Settings")}</span></div>
              <div style={cBody}>
                <Fld label={T("المنتج / الخدمة / العرض","Product / Service / Offer")}>
                  <GroupedProductPicker selected={prod} onSelect={setProd} lang={lang} extras={prodExtras} onToggleExtra={v=>toggleExtra(v,setProdExtras)}/>
                </Fld>
                <Fld label={T("مستوى الجمهور","Audience Level")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    <Seg ch="TOF" on={funnel==="TOF"} gold={funnel==="TOF"} onClick={()=>setFunnel("TOF")}/>
                    <Seg ch="MOF" on={funnel==="MOF"} onClick={()=>setFunnel("MOF")}/>
                    <Seg ch="BOF" on={funnel==="BOF"} onClick={()=>setFunnel("BOF")}/>
                  </div>
                </Fld>
                <Fld label={T("القناة — اختر واحدة أو أكثر","Channel — pick one or more")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {["Instagram","Facebook","TikTok","Snapchat","LinkedIn","Twitter/X","Google Ads"].map(v=><Seg key={v} ch={v} on={chans.includes(v)} onClick={()=>toggleChan(v)}/>)}
                  </div>
                  {chans.length>1&&<p style={{fontSize:9.5,color:"#f5a623",marginTop:4,direction:dir}}>{T(`سيتم توليد محتوى مستقل لكل قناة (${chans.length})`,`Will generate separate content for each channel (${chans.length})`)} </p>}
                </Fld>
                {/* Extra Note — always visible, with quick-pick presets */}
                <Fld label={T("سياق إضافي","Context / Extra Note")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
                    {[
                      {ar:"ضغط ZATCA",en:"ZATCA deadline"},
                      {ar:"مطاعم وكافيهات",en:"F&B"},
                      {ar:"محاسبين ومكاتب",en:"Accountants"},
                      {ar:"تجزئة",en:"Retail"},
                      {ar:"مقاولات",en:"Construction"},
                      {ar:"رمضان",en:"Ramadan"},
                      {ar:"نهاية العام",en:"Year-end"},
                    ].map(p=>(
                      <button key={p.ar} onClick={()=>setExtraNote(lang==="ar"?p.ar:p.en)}
                        style={{padding:"3px 8px",borderRadius:12,border:`1px solid ${extraNote===(lang==="ar"?p.ar:p.en)?"rgba(23,163,164,.6)":"rgba(1,53,90,.45)"}`,background:extraNote===(lang==="ar"?p.ar:p.en)?"rgba(23,163,164,.15)":"rgba(7,22,48,.5)",color:extraNote===(lang==="ar"?p.ar:p.en)?"#17a3a3":"#6a96aa",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                        {lang==="ar"?p.ar:p.en}
                      </button>
                    ))}
                    {extraNote&&<button onClick={()=>setExtraNote("")} style={{padding:"3px 8px",borderRadius:12,border:"1px solid rgba(240,112,112,.3)",background:"none",color:"#f07070",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>×</button>}
                  </div>
                  <input value={extraNote} onChange={e=>setExtraNote(e.target.value)} placeholder={T("أو اكتب سياق مخصص — مثال: الجمهور أصحاب مطاعم في جدة","or type custom context — e.g. audience: restaurant owners in Jeddah")}/>
                </Fld>
                <button onClick={()=>setAdvContent(v=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",color:"#2e5468",fontSize:10.5,cursor:"pointer",padding:"4px 0",fontFamily:"inherit"}}>
                  <span style={{fontSize:10,transition:"transform .15s",display:"inline-block",transform:advContent?"rotate(90deg)":"none"}}>▶</span>
                  {advContent?T("إخفاء الخيارات المتقدمة","Hide advanced options"):T("خيارات متقدمة","Advanced options")}
                </button>
                {advContent&&(
                  <>
                    <Fld label={T("تركيز الميزة","Feature Focus")}>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        <Seg ch={T("بدون","None")} on={featFocus===""} onClick={()=>setFeatFocus("")}/>
                        {FEATURES.map(f=><Seg key={f.v} ch={lang==="ar"?f.ar:f.v} on={featFocus===f.v} onClick={()=>setFeatFocus(f.v)}/>)}
                      </div>
                    </Fld>
                    <Fld label={T("شريحة العميل (ICP)","Target ICP")}>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        <Seg ch={T("عام","Any")} on={contentICP===""} onClick={()=>setContentICP("")}/>
                        {ICP_PERSONAS.map(p=><Seg key={p.id} ch={p.title} on={contentICP===p.id} onClick={()=>setContentICP(p.id)}/>)}
                      </div>
                    </Fld>
                    <div style={row2}>
                      <Fld label={T("التنسيق","Format")}><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{["Static","Video","Carousel","UGC","Reel"].map(v=><Seg key={v} ch={v} on={fmt===v} onClick={()=>setFmt(v)}/>)}</div></Fld>
                      <Fld label={T("القطاع","Sector")}><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{SECTORS.map(sc=><Seg key={sc.v} ch={lang==="ar"?sc.ar:sc.en} on={sector===sc.v} onClick={()=>setSector(sc.v)}/>)}</div></Fld>
                    </div>
                    <div style={row2}>
                      <Fld label={T("نوع الجملة الافتتاحية","Hook Type")}><select value={hookType} onChange={e=>setHookType(e.target.value)}>{HOOK_TYPES.map(h=><option key={h.v} value={h.v}>{lang==="ar"?h.ar:h.en}</option>)}</select></Fld>
                      <Fld label={T("مرجع الحملة","Campaign Ref")}><select value={campRef} onChange={e=>setCampRef(e.target.value)}><option value="">{T("— لا يوجد —","— None —")}</option><optgroup label="ZATCA"><option value="C05">C05</option><option value="C07">C07</option></optgroup><optgroup label="F&B"><option value="FL01">FL01</option><option value="FL02">FL02</option></optgroup><optgroup label="Bookkeeping"><option value="C01">C01</option><option value="BK01">BK01</option></optgroup></select></Fld>
                    </div>
                  </>
                )}
                <div style={{padding:"10px 0",borderTop:"1px solid rgba(1,53,90,.25)",marginTop:4}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:variantCount>1?8:0}}>
                    <span style={{fontSize:11,color:"#6a96aa"}}>{T("عدد النسخ","# of Variants")}</span>
                    <div style={{display:"flex",background:"#0a1f3d",border:"1px solid rgba(1,53,90,.45)",borderRadius:5,overflow:"hidden",height:26}}>
                      {[1,2,3,4,5].map(n=>(
                        <button key={n} onClick={()=>{setVariantCount(n);setCr(null);setAbRes(null);}} style={{padding:"0 12px",height:"100%",background:variantCount===n?"rgba(23,163,164,.15)":"none",border:"none",borderLeft:n>1?"1px solid rgba(1,53,90,.45)":"none",color:variantCount===n?"#17a3a3":"#2e5468",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{n}</button>
                      ))}
                    </div>
                  </div>
                  {variantCount>1&&(
                    <textarea value={abConceptCt} onChange={e=>setAbConceptCt(e.target.value)} rows={2} dir="rtl" style={{textAlign:"right",marginTop:6}} placeholder={T(`الفكرة أو الرسالة الرئيسية لـ ${variantCount} نسخ…`,`Core concept or message for ${variantCount} variants…`)}/>
                  )}
                </div>
                <Btn ch={cl?T("يكتب...","Writing..."):variantCount>1?T(`ولّد ${variantCount} نسخ`,`Generate ${variantCount} Variants`):T("أنشئ المحتوى الآن","Create Content Now")} gold={!cl} onClick={variantCount>1?genContentAB:genContent} dis={cl} full/>
              </div>
            </div>
            {cl&&<Loader msg={variantCount>1?T(`يكتب ${variantCount} نسخ بزوايا مختلفة...`,`Writing ${variantCount} different angles...`):T("يكتب النص الإعلاني...","Writing ad copy...")}/>}
            {abRes&&!cl&&(()=>{
              // Support both new {variants:[]} schema and legacy {variant_a, variant_b} schema
              const variants=Array.isArray(abRes.variants)?abRes.variants:["variant_a","variant_b"].map(k=>abRes[k]).filter(Boolean);
              const accents=["#17a3a3","#f59e0b","#a78bfa","#5dc87a","#f07070"];
              const cols=variants.length<=2?"1fr 1fr":variants.length===3?"1fr 1fr 1fr":"repeat(2,1fr)";
              return(
              <div className="qa">
                <div style={{display:"grid",gridTemplateColumns:cols,gap:10,marginTop:10}}>
                  {variants.map((v,idx)=>{
                    if(!v)return null;
                    const accent=accents[idx%accents.length];
                    const fullCopy=`${v.ad_copy?.hook}\n\n${v.ad_copy?.body}\n\nCTA: ${v.ad_copy?.cta}\n\nGoogle Headlines:\n${(v.google_headlines||[]).join("\n")}\n\nInstagram:\n${v.captions?.instagram||""}`;
                    return(
                      <div key={idx} style={{...card,marginBottom:0,border:`1.5px solid ${accent}30`}}>
                        <div style={{...cHead,background:`${accent}08`,borderBottom:`1px solid ${accent}20`}}>
                          <span style={{fontSize:11.5,fontWeight:700,color:accent}}>{v.label||`Variant ${idx+1}`}</span>
                          <div style={{display:"flex",gap:5}}>
                            <Tag ch={v.predicted_ctr||"—"} style={{fontSize:9,background:`${accent}15`,color:accent}}/>
                            <Btn ch={T("نسخ الكل","Copy All")} xs onClick={()=>copyText(fullCopy)}/>
                            <Btn ch={T("سجّل كاختبار","Log as Test")} xs onClick={()=>{setHypText(`${v.label||`Variant ${idx+1}`}: ${v.ad_copy?.hook||""}`);setHypModalOpen(true);}}/>
                          </div>
                        </div>
                        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
                          <div style={{padding:"8px 10px",background:"rgba(23,163,164,.05)",borderRadius:6,direction:"rtl"}}>
                            <p style={{fontSize:8.5,color:"#6a96aa",marginBottom:3,textTransform:"uppercase"}}>{T("نسخة الإعلان","Ad Copy")}</p>
                            <p style={{fontSize:12.5,fontWeight:700,marginBottom:5}}>{v.ad_copy?.hook}</p>
                            <p style={{fontSize:11.5,lineHeight:1.7,color:"#bbd4e0"}}>{v.ad_copy?.body}</p>
                            <Tag ch={v.ad_copy?.cta} style={{marginTop:6,fontSize:10,background:`${accent}18`,color:accent}}/>
                          </div>
                          {v.google_headlines&&v.google_headlines.length>0&&(
                            <div>
                              <p style={{fontSize:8.5,color:"#6a96aa",marginBottom:4,textTransform:"uppercase"}}>Google Headlines</p>
                              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                                {v.google_headlines.map((h,i)=><p key={i} style={{fontSize:11,color:"#ddeef4",padding:"4px 8px",background:"rgba(7,22,48,.8)",borderRadius:4,direction:"ltr",textAlign:"left"}}>{h}</p>)}
                              </div>
                            </div>
                          )}
                          {v.captions?.instagram&&(
                            <div>
                              <p style={{fontSize:8.5,color:"#6a96aa",marginBottom:4,textTransform:"uppercase"}}>{T("كابشن","Caption")}</p>
                              <p style={{fontSize:10.5,color:"#bbd4e0",direction:"rtl",lineHeight:1.6}}>{v.captions.instagram}</p>
                            </div>
                          )}
                          {v.why&&<p style={{fontSize:10,color:"#5dc87a",direction:"rtl",borderTop:"1px solid rgba(1,53,90,.3)",paddingTop:6}}>{v.why}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {abRes.recommendation&&(
                  <div style={{...card,marginTop:8}}>
                    <div style={cBody}><p style={{fontSize:9.5,color:"#2e5468",marginBottom:3}}>{T("التوصية","Recommendation")}</p><p style={{fontSize:12,direction:"rtl",lineHeight:1.7,color:"#ddeef4"}}>{abRes.recommendation}</p></div>
                  </div>
                )}
              </div>
              );
            })()}
            {/* ── Content results — single or multi-channel ── */}
            {!cl&&variantCount===1&&Object.keys(crMulti).length>0&&(()=>{
              const channelList=Object.keys(crMulti);
              return(
                <div className="qa">
                  {channelList.map(ch=>{
                    const r=crMulti[ch];
                    if(!r)return null;
                    if(r.error)return(
                      <div key={ch} style={{...card,marginBottom:8}}>
                        <div style={cHead}><span style={{fontSize:11,color:"#f07070"}}>{ch}</span></div>
                        <div style={cBody}><p style={{color:"#f07070",fontSize:11}}>{r.error}</p></div>
                      </div>
                    );
                    return(
                      <div key={ch} style={{...card,marginBottom:8}}>
                        <div style={cHead}>
                          <span style={{fontSize:11.5,fontWeight:600,color:pctx.color}}>{lang==="ar"?pctx.ar:pctx.v} · {ch} · {funnel}</span>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            <Btn ch={T("نسخ الكل","Copy All")} xs onClick={()=>{
                              const base=`${r.ad_copy?.hook}\n\n${r.ad_copy?.body}\n\nCTA: ${r.ad_copy?.cta}`;
                              copyText(ch==="Google Ads"?`${base}\n\nHeadlines:\n${(r.google_headlines||[]).map((h,i)=>`H${i+1}: ${h}`).join("\n")}\n\nDescriptions:\n${(r.google_descriptions||[]).map((d,i)=>`D${i+1}: ${d}`).join("\n")}`:`${base}\n\n${ch} Caption:\n${r.caption||""}`);
                            }}/>
                            {channelList.length===1&&<Btn ch={T("سجّل كاختبار","Log as Test")} xs onClick={()=>{setHypText(r.ad_copy?.hook||"");setHypModalOpen(true);}}/>}
                            <button onClick={()=>{
                              const base=`${r.ad_copy?.hook}\n\n${r.ad_copy?.body}\n\nCTA: ${r.ad_copy?.cta}`;
                              const full=ch==="Google Ads"?`${base}\n\nHeadlines:\n${(r.google_headlines||[]).map((h,i)=>`H${i+1}: ${h}`).join("\n")}\n\nDescriptions:\n${(r.google_descriptions||[]).map((d,i)=>`D${i+1}: ${d}`).join("\n")}`:`${base}\n\n${ch} Caption:\n${r.caption||""}`;
                              uploadToDrive(full,`qoyod-${ch.replace("/","")}.txt`,"text/plain",`cr_${ch}`);
                            }} disabled={driveLd[`cr_${ch}`]} style={{padding:"3px 8px",borderRadius:4,border:"1px solid rgba(66,133,244,.4)",background:"rgba(66,133,244,.1)",color:driveLinks[`cr_${ch}`]?"#5dc87a":"#4285f4",fontSize:9.5,cursor:"pointer",fontFamily:"inherit",fontWeight:600,opacity:driveLd[`cr_${ch}`]?.6:1}}>
                              {driveLd[`cr_${ch}`]?"↑…":driveLinks[`cr_${ch}`]?<a href={driveLinks[`cr_${ch}`]} target="_blank" rel="noreferrer" style={{color:"#5dc87a",textDecoration:"none"}}>✓ Drive</a>:"☁ Drive"}
                            </button>
                          </div>
                        </div>
                        <div style={cBody}>
                          <div style={{marginBottom:12}}>
                            <p className="label">{T("نسخة الإعلان","Ad Copy")}</p>
                            <div style={{padding:"10px 12px",background:"rgba(23,163,164,.05)",borderRadius:8,direction:"rtl"}}>
                              <p style={{fontSize:14,fontWeight:700,marginBottom:8,lineHeight:1.5}}>{r.ad_copy?.hook}</p>
                              <p className="ai-body" style={{color:"#bbd4e0",marginBottom:8}}>{r.ad_copy?.body}</p>
                              <Tag ch={r.ad_copy?.cta} green style={{fontSize:11}}/>
                            </div>
                          </div>
                          {ch==="Google Ads"&&(
                            <div style={{marginBottom:12}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <p className="label" style={{marginBottom:0}}>Google RSA — Headlines ({r.google_headlines?.length||0}/10)</p>
                                <Btn ch={T("نسخ","Copy")} xs onClick={()=>copyText([...(r.google_headlines||[]).map((h,i)=>`H${i+1}: ${h}`),...(r.google_descriptions||[]).map((d,i)=>`D${i+1}: ${d}`)].join("\n"))}/>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:8}}>
                                {(r.google_headlines||[]).map((h,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:8.5,color:"#17a3a3",fontWeight:700,minWidth:22}}>H{i+1}</span><p style={{fontSize:11.5,color:"#ddeef4",direction:"ltr",textAlign:"left",flex:1}}>{h}</p><span style={{fontSize:8,color:h.length>30?"#f07070":"#2e5468"}}>{h.length}/30</span></div>)}
                              </div>
                              <p className="label">Descriptions ({r.google_descriptions?.length||0}/4)</p>
                              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                                {(r.google_descriptions||[]).map((d,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:6}}><span style={{fontSize:8.5,color:"#6a96aa",fontWeight:700,minWidth:22,paddingTop:1}}>D{i+1}</span><p style={{fontSize:11,color:"#bbd4e0",direction:"ltr",textAlign:"left",flex:1,lineHeight:1.5}}>{d}</p><span style={{fontSize:8,color:d.length>90?"#f07070":"#2e5468"}}>{d.length}/90</span></div>)}
                              </div>
                            </div>
                          )}
                          {ch!=="Google Ads"&&(r.caption||r.captions)&&(
                            <div>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <p className="label" style={{marginBottom:0}}>{ch} {T("كابشن","Caption")}</p>
                                <Btn ch={T("نسخ","Copy")} xs onClick={()=>copyText(r.caption||r.captions?.instagram||"")}/>
                              </div>
                              <div style={{padding:"10px 12px",background:"rgba(7,22,48,.7)",borderRadius:8}}>
                                <p className="ai-body" style={{fontSize:11,color:"#ddeef4"}}>{r.caption||r.captions?.instagram}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {tab==="campaign"&&(
          <div className="qa">
            <SH title={T("مولّد الحملات","Campaign Generator")} sub={T("بريف حملة كامل بنصوص لكل قناة","Full campaign brief with per-channel copy")}/>
            <ErrBox msg={campErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("تفاصيل الحملة","Campaign Details")}</span></div>
              <div style={cBody}>
                <Fld label={T("نوع الحملة","Type")}><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{[["Seasonal",T("موسمية","Seasonal")],["Feature",T("ميزة جديدة","New Feature")],["ZATCA","ZATCA"],["Sector",T("قطاعية","Sector")],["Competitor",T("استحواذ منافس","Competitor")]].map(([v,l])=><Seg key={v} ch={l} on={campType===v} onClick={()=>setCampType(v)}/>)}</div></Fld>
                <Fld label={T("موضوع الحملة","Theme")}><input value={campTheme} onChange={e=>setCampTheme(e.target.value)} placeholder={T("مثال: اليوم الوطني · إطلاق POS","e.g. National Day · POS Launch")}/></Fld>
                <Fld label={T("الهدف","Objective")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {[["Leads",T("جذب عملاء","Leads")],["Direct Purchase",T("شراء مباشر","Direct Purchase")],["Engagement",T("تفاعل","Engagement")],["Awareness",T("وعي بالعلامة","Awareness")],["Product Announcement",T("إطلاق منتج","Product Announcement")]].map(([v,l])=><Seg key={v} ch={l} on={campObj===v} onClick={()=>setCampObj(v)}/>)}
                  </div>
                </Fld>
                <Fld label={T("القنوات","Channels")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {["Meta","TikTok","Snapchat","LinkedIn","Google","Twitter","Email"].map(v=><Seg key={v} ch={v} on={campChs.includes(v)} onClick={()=>setCampChs(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v])}/>)}
                  </div>
                </Fld>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <Fld label={T("الميزانية (ريال)","Budget (SAR)")}><input type="number" value={campBudget} onChange={e=>setCampBudget(e.target.value)} placeholder={T("مثال: 15000","e.g. 15000")}/></Fld>
                  <Fld label={T("المدة (أسابيع)","Duration (weeks)")}><select value={campDuration} onChange={e=>setCampDuration(e.target.value)}>{["1","2","3","4","6","8","12"].map(w=><option key={w} value={w}>{w} {T("أسابيع","weeks")}</option>)}</select></Fld>
                  <Fld label={T("النطاق الجغرافي","Geo Scope")}><select value={campScope} onChange={e=>setCampScope(e.target.value)}>{[["Saudi Arabia",T("السعودية","Saudi Arabia")],["GCC",T("الخليج","GCC")],["MENA",T("الشرق الأوسط","MENA")]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Fld>
                </div>
                <Fld label={T("سياق إضافي","Context")}><textarea value={campCtx} onChange={e=>setCampCtx(e.target.value)} rows={2} placeholder={T("مثال: خصم 30% — إطلاق رمضان","e.g. 30% off — Ramadan launch")}/></Fld>
                <Btn ch={T("أنشئ الحملة الكاملة","Create Full Campaign")} gold onClick={genCampaign} dis={campLd} full/>
              </div>
            </div>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("مرجع الحملات","Campaign Reference")}</span></div>
              <div style={cBody}>
                {CAMPS.map(c=>(
                  <div key={c.id} onClick={()=>setCampTheme(lang==="en"?c.en:c.ar)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:7,border:"1px solid rgba(1,53,90,.45)",background:"rgba(7,22,48,.5)",marginBottom:5,cursor:"pointer",direction:"rtl"}}>
                    <span style={{fontSize:10,fontWeight:700,color:"#17a3a3",minWidth:36}}>{c.id}</span>
                    <span style={{fontSize:11,color:"#ddeef4",flex:1,lineHeight:1.4,textAlign:"right"}}>{lang==="en"?c.en:c.ar}</span>
                    <div style={{display:"flex",gap:4}}><Tag ch={c.s} t style={{fontSize:9.5}}/><Tag ch={c.st} style={{fontSize:9.5}}/></div>
                  </div>
                ))}
              </div>
            </div>
            {campLd&&<Loader msg={T("يبني الحملة...","Building campaign...")}/>}
            {campRes&&!campLd&&(
              <div style={{...card,animation:"qrise .3s ease both"}}>
                <div style={cHead}><span style={{fontSize:12,fontWeight:600,color:"#17a3a3"}}>{campRes.campaign_name}</span><Tag ch={campRes.target_stage} t/></div>
                <div style={cBody}>
                  <Hook text={campRes.core_message}/><Hr/>
                  {(campRes.hooks||[]).sort((a,b)=>(b.strength||0)-(a.strength||0)).map((h,i)=>(
                    <div key={i} style={{padding:"8px 10px",borderRadius:7,background:"rgba(7,22,48,.6)",border:"1px solid rgba(1,53,90,.45)",marginBottom:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><span style={{fontSize:9.5,color:"#2e5468",minWidth:14}}>{i+1}</span><span style={{fontSize:12.5,fontWeight:600,flex:1,direction:"rtl",textAlign:"right"}}>{h.text}</span>{i===0&&<Tag ch={T("الأقوى","Strongest")} g style={{fontSize:9.5}}/>}</div>
                      <div style={{display:"flex",gap:4}}><Tag ch={h.type} t style={{fontSize:9.5}}/><Tag ch={h.channel} style={{fontSize:9.5}}/></div>
                      <SBar v={h.strength||75}/>
                    </div>
                  ))}<Hr/>
                  {(campRes.ad_copies||[]).map((ad,i)=>(
                    <div key={i} style={{padding:"10px",borderRadius:7,background:"#0a1f3d",border:"1px solid rgba(1,53,90,.45)",marginBottom:7}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><Tag ch={ad.channel} t style={{fontSize:10.5}}/><Tag ch={ad.format} style={{fontSize:10.5}}/><Btn ch={T("نسخ","Copy")} xs style={{marginLeft:"auto"}} onClick={()=>copyText(`${ad.hook}\n\n${ad.body}\nCTA: ${ad.cta}`)}/></div>
                      <Hook text={ad.hook}/><p className="ai-body" style={{fontSize:11.5,color:"#ddeef4",marginBottom:7}}>{ad.body}</p>
                      <div style={{display:"flex",gap:4}}><Tag ch={ad.cta} green style={{fontSize:10.5}}/><Tag ch={ad.trust} t style={{fontSize:10.5}}/></div>
                    </div>
                  ))}
                  {campRes.timeline&&(<><Hr/><p style={{fontSize:9.5,color:"#2e5468",marginBottom:7,textTransform:"uppercase",letterSpacing:".04em"}}>{T("الجدول الزمني","Timeline")} · {campRes.timeline.weeks} {T("أسابيع","weeks")}</p><div style={{display:"flex",flexDirection:"column",gap:5}}>{(campRes.timeline.phases||[]).map((ph,i)=><div key={i} style={{display:"flex",gap:8,padding:"7px 10px",background:"rgba(7,22,48,.6)",borderRadius:6,border:"1px solid rgba(1,53,90,.3)"}}><div style={{minWidth:80,fontSize:9.5,color:"#17a3a3",fontWeight:600,direction:"ltr"}}>{ph.week}</div><div style={{flex:1,direction:"rtl"}}><p style={{fontSize:10.5,fontWeight:600,color:"#ddeef4",marginBottom:2}}>{ph.focus}</p><p style={{fontSize:10,color:"#6a96aa"}}>{ph.action}</p></div></div>)}</div></>)}
                  {campRes.kpis&&campRes.kpis.length>0&&(<><Hr/><p style={{fontSize:9.5,color:"#2e5468",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>KPIs</p><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{campRes.kpis.map((k,i)=><Tag key={i} ch={k} style={{fontSize:10.5,color:"#5dc87a",background:"rgba(93,200,122,.06)",border:"1px solid rgba(93,200,122,.2)"}}/>)}</div></>)}
                  {campRes.budget_split&&(<><Hr/><p style={{fontSize:9.5,color:"#2e5468",marginBottom:7,textTransform:"uppercase",letterSpacing:".04em"}}>{T("توزيع الميزانية","Budget Split")}{campBudget?` · ${Number(campBudget).toLocaleString()} SAR`:""}</p>{Object.entries(campRes.budget_split).map(([ch2,pct])=>{const pNum=parseInt(pct)||0;return(<div key={ch2} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><span style={{fontSize:11,color:"#ddeef4",minWidth:64}}>{ch2}</span><div style={{flex:1,height:4,background:"rgba(255,255,255,.04)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct,background:"linear-gradient(90deg,#17a3a3,#13778d)",borderRadius:2}}/></div><span style={{fontSize:10.5,color:"#17a3a3",fontWeight:700,minWidth:28}}>{pct}</span>{campBudget&&<span style={{fontSize:9.5,color:"#2e5468",minWidth:48}}>{Math.round(Number(campBudget)*pNum/100).toLocaleString()} SAR</span>}</div>);})}</>)}
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="market"&&(
          <div className="qa">
            <SH title={T("مراقبة السوق","Market Watch")} sub={T("تحليل المنافسين وأنشئ نسخاً مضادة","Competitor analysis & counter-creatives")}/>
            <ErrBox msg={mErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("رادار المنافسين","Competitor Radar")}</span></div>
              <div style={cBody}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:7,marginBottom:12}}>
                  {COMPS.map(c=>(
                    <div key={c.id} onClick={()=>setMComp(lang==="en"?c.en:c.n)} style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${mComp===(lang==="en"?c.en:c.n)?"rgba(23,163,164,.45)":"rgba(1,53,90,.45)"}`,background:mComp===(lang==="en"?c.en:c.n)?"rgba(23,163,164,.1)":"#0a1f3d",cursor:"pointer"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <div style={{width:24,height:24,borderRadius:5,background:c.lb,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10.5,fontWeight:800,color:"#fff",flexShrink:0}}>{c.lt}</div>
                        <div><div style={{fontSize:12,fontWeight:700,color:c.c}}>{lang==="en"?c.en:c.n}</div><span style={{fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:600,...(c.thr==="high"?{background:"rgba(240,112,112,.12)",color:"#f07070"}:c.thr==="mid"?{background:"rgba(245,166,35,.12)",color:"#f5a623"}:{background:"rgba(93,200,122,.1)",color:"#5dc87a"})}}>{c.thr==="high"?T("عالي","High"):c.thr==="mid"?T("متوسط","Med"):T("منخفض","Low")}</span></div>
                      </div>
                      <div style={{fontSize:10,color:"#2e5468",lineHeight:1.4}}>{lang==="en"?c.wae:c.war}</div>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:10.5,color:"#6a96aa",direction:"rtl",textAlign:"right",marginTop:6}}>{T("اختر منافساً من الأعلى ثم املأ النموذج أدناه أو حمّل إعلاناتهم النشطة من Meta","Pick a competitor above, then fill the form below or load their live ads from Meta")}</p>
              </div>
            </div>
            {/* Live ads loader (Apify-powered: Meta + Google + Instagram organic) */}
            <div style={{...card,marginTop:10}}>
              <div style={cHead}>
                <span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعلانات ومنشورات المنافس","Competitor Ads & Posts")}{liveAds.length>0&&<span style={{fontSize:9,color:"#6a96aa",marginRight:6}}>({liveAds.length})</span>}</span>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {liveAds.length>0&&<Btn ch={T("مسح","Clear")} xs onClick={()=>{setLiveAds([]);setLiveAdsErr(null);}}/>}
                  <Btn ch="Meta Ads" xs onClick={()=>loadLiveAds("facebook")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="FB Organic" xs onClick={()=>loadLiveAds("facebook_organic")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="Google" xs onClick={()=>loadLiveAds("google")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="IG" xs onClick={()=>loadLiveAds("instagram")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="TikTok Ads" xs onClick={()=>loadLiveAds("tiktok_ads")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="TikTok" xs onClick={()=>loadLiveAds("tiktok")} dis={liveAdsLd||!mComp}/>
                  <Btn ch="Snap" xs onClick={()=>loadLiveAds("snapchat")} dis={liveAdsLd||!mComp}/>
                  {(()=>{const lc=COMPS.find(c=>c.en===mComp||c.n===mComp);return(<><button onClick={()=>lc&&window.open(`https://www.linkedin.com/company/${lc.id}/posts/`,"_blank")} disabled={!mComp} style={{padding:"3px 8px",borderRadius:4,border:"1px solid rgba(10,102,194,.35)",background:"rgba(10,102,194,.08)",color:mComp?"#4a9fd4":"#2e5468",fontSize:9.5,cursor:mComp?"pointer":"default",fontFamily:"inherit",fontWeight:600,opacity:mComp?1:.4}} title="Opens LinkedIn in browser">🔗 LinkedIn</button><button onClick={()=>lc&&window.open(`https://www.linkedin.com/ad-library/search?q=${encodeURIComponent(lc.en)}`,"_blank")} disabled={!mComp} style={{padding:"3px 8px",borderRadius:4,border:"1px solid rgba(10,102,194,.35)",background:"rgba(10,102,194,.08)",color:mComp?"#4a9fd4":"#2e5468",fontSize:9.5,cursor:mComp?"pointer":"default",fontFamily:"inherit",fontWeight:600,opacity:mComp?1:.4}} title="Opens LinkedIn Ad Library in browser">🔗 LI Ads</button></>);})()}
                  <Btn ch="YouTube" xs onClick={()=>loadLiveAds("youtube")} dis={liveAdsLd||!mComp}/>
                </div>
              </div>
              <div style={cBody}>
                {liveAdsLd&&<div style={{padding:"10px",fontSize:10.5,color:"#17a3a3",direction:"rtl",textAlign:"right"}}>{T("⏳ يجلب الإعلانات من Apify... قد يستغرق 30-60 ثانية","⏳ Fetching ads via Apify... may take 30-60 seconds")}</div>}
                {liveAdsBillingLimit&&<div style={{padding:"10px 14px",borderRadius:6,background:"rgba(23,163,163,.07)",border:"1px solid rgba(23,163,163,.2)",fontSize:10.5,color:"#6a96aa",direction:"rtl",textAlign:"right",marginBottom:8,lineHeight:1.6}}>
                  <span style={{fontWeight:700,color:"#17a3a3",display:"block",marginBottom:4}}>رصد المنافسين متوقف مؤقتاً</span>
                  {T("وصل حساب Apify لحد الاستخدام الشهري. يُعاد التشغيل تلقائياً في أول الشهر القادم.","Apify monthly usage limit reached. Scraping resumes automatically on the 1st of next month.")}
                  <span style={{display:"block",marginTop:6,fontSize:10,color:"#4a9fd4"}}>
                    {T("يمكنك الاستمرار في التحليل يدوياً — الصق رابط البوست أو نص الإعلان في النموذج أدناه.","You can still analyze manually — paste a post URL or ad text in the form below.")}
                  </span>
                </div>}
                {liveAdsErr&&<div style={{padding:"6px 10px",borderRadius:5,background:"rgba(245,166,35,.06)",border:"1px solid rgba(245,166,35,.25)",fontSize:10.5,color:"#f5a623",direction:"rtl",textAlign:"right",marginBottom:8}}>{liveAdsErr}</div>}
                {!liveAdsLd&&!liveAdsBillingLimit&&liveAds.length===0&&!liveAdsErr&&<p style={{fontSize:10.5,color:"#6a96aa",direction:"rtl",textAlign:"right"}}>{T("اختر منافساً ثم اضغط أي قناة — Ads = مدفوع · Organic/IG/TikTok/Snap/YT = Organic","Pick a competitor then tap a channel — Ads = Paid · Organic/IG/TikTok/Snap/YT = Organic")}</p>}
                {liveAds.length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                    {[...liveAds].sort((a,b)=>{const ta=a.started?new Date(typeof a.started==="number"?a.started*1000:a.started).getTime():0;const tb=b.started?new Date(typeof b.started==="number"?b.started*1000:b.started).getTime():0;return tb-ta;}).map((ad,i)=>{const isPaid=["facebook","google","tiktok_ads","linkedin_ads"].includes(ad._source);return(
                      <div key={(ad._source||"")+"|"+(ad.id||i)} style={{padding:"10px 12px",borderRadius:7,border:`1px solid ${isPaid?"rgba(245,166,35,.3)":"rgba(93,200,122,.25)"}`,background:"#0a1f3d"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#17a3a3"}}>{ad.page_name}</span>
                            <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,...(isPaid?{background:"rgba(245,166,35,.12)",color:"#f5a623"}:{background:"rgba(93,200,122,.1)",color:"#5dc87a"})}}>{ isPaid?"Paid":"Organic"}</span>
                          </div>
                          <div style={{display:"flex",gap:3}}>{(ad.platforms||[]).slice(0,3).map(p=><Tag key={p} ch={p.slice(0,3)} style={{fontSize:8.5}}/>)}</div>
                        </div>
                        {ad.hook&&<p style={{fontSize:11,fontWeight:600,color:"#ddeef4",direction:"rtl",textAlign:"right",marginBottom:4}}>{ad.hook.slice(0,80)}</p>}
                        {ad.body&&<p style={{fontSize:10,color:"#bbd4e0",direction:"rtl",textAlign:"right",lineHeight:1.5,marginBottom:6,maxHeight:60,overflow:"hidden"}}>{ad.body.slice(0,140)}{ad.body.length>140?"…":""}</p>}
                        {/* Date + engagement row */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:4}}>
                          <DateLabel started={ad.started} isPaid={isPaid}/>
                          {ad.caption?<span style={{fontSize:9,color:"#8aafc4",textAlign:"right",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ad.caption}</span>:<span style={{fontSize:9,color:"#2e5468"}}>—</span>}
                        </div>
                        <div style={{display:"flex",gap:4}}>
                          <Btn ch={T("استخدم للتحليل","Use for Analysis")} xs onClick={()=>useLiveAdAsInput(ad)}/>
                          {ad.snapshot_url&&<a href={ad.snapshot_url} target="_blank" rel="noreferrer" style={{padding:"3px 8px",borderRadius:4,fontSize:9,color:"#6a96aa",textDecoration:"none",border:"1px solid rgba(106,150,170,.3)"}}>{T("معاينة","Preview")}↗</a>}
                          {ad.detail_url&&!ad.snapshot_url&&<a href={ad.detail_url} target="_blank" rel="noreferrer" style={{padding:"3px 8px",borderRadius:4,fontSize:9,color:"#6a96aa",textDecoration:"none",border:"1px solid rgba(106,150,170,.3)"}}>View↗</a>}
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </div>
            <div style={{...card,marginTop:10}}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("تحليل إعلان منافس","Analyze Competitor Ad")}</span></div>
              <div style={cBody}>
                <div style={row2}>
                  <Fld label={T("المنافس","Competitor")}><select value={mComp} onChange={e=>setMComp(e.target.value)}><option value="">{T("— اختر —","— Select —")}</option>{COMPS.map(c=><option key={c.id} value={lang==="en"?c.en:c.n}>{lang==="en"?c.en:c.n}</option>)}</select></Fld>
                  <Fld label={T("القناة","Channel")}><select value={mChan} onChange={e=>setMChan(e.target.value)}>{["Instagram","Facebook","TikTok","Snapchat","LinkedIn","Twitter/X","Website","Google Search"].map(v=><option key={v}>{v}</option>)}</select></Fld>
                </div>
                {/* Quick-fill links for selected competitor */}
                {(()=>{const comp=COMPS.find(c=>(lang==="en"?c.en:c.n)===mComp||c.en===mComp||c.n===mComp);if(!comp)return null;const chip=(label,url,icon)=>(<button key={label} onClick={()=>setMDesc(url)} style={{padding:"3px 9px",borderRadius:4,fontSize:9.5,fontWeight:600,background:"rgba(1,53,90,.5)",border:"1px solid rgba(106,150,170,.25)",color:"#8aafc4",cursor:"pointer",fontFamily:"inherit"}}>{icon} {label}</button>);return(<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>{chip(`${comp.domain}`,`https://www.${comp.domain}`,"🌐")}{comp.pricing&&chip("Pricing",comp.pricing,"💰")}{chip("Google Search",`https://www.google.com/search?q=${encodeURIComponent((lang==="en"?comp.en:comp.n)+" "+comp.domain)}`,"🔍")}{chip("Google Ads",`https://adstransparency.google.com/?region=SA&domain=${comp.domain}`,"📢")}</div>);})()}
                <Fld label={T("رابط البوست / الإعلان أو وصفه","Post / Ad URL or Description")}>
                  <textarea value={mDesc} onChange={e=>setMDesc(e.target.value)} rows={3}
                    placeholder={mChan==="LinkedIn"
                      ? T("الصق نص البوست من LinkedIn هنا مباشرةً — افتح الصفحة بزر 🔗 LinkedIn أعلاه، انسخ نص البوست، والصقه هنا","Open LinkedIn via 🔗 above → copy the post text → paste it here")
                      : T("الصق أي رابط — موقع المنافس · صفحة الأسعار · بوست IG/FB · إعلان · نتائج Google — أو اكتب وصفاً يدوياً","Paste any URL — competitor website · pricing page · IG/FB post · ad · Google results — or describe manually")
                    }
                    dir="rtl" style={{textAlign:"right"}}
                  />
                  <p style={{fontSize:9.5,color:mChan==="LinkedIn"?"#f5a623":"#6a96aa",marginTop:4,direction:"rtl"}}>
                    {mChan==="LinkedIn"
                      ? T("⚠ LinkedIn يحجب الروابط — الصق نص البوست مباشرةً للتحليل","⚠ LinkedIn blocks URL fetching — paste post text directly to analyze")
                      : T("يجلب المحتوى الحقيقي من الرابط تلقائياً — يعمل مع المواقع والبوستات والإعلانات","Auto-fetches real content from any URL — websites, posts, ads, pricing pages")
                    }
                  </p>
                </Fld>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Btn ch={T("حلّل المحتوى","Analyze Content")} onClick={genAnalysis} dis={mLd} full/>
                  <Btn ch={T("أنشئ نسخة مضادة","Counter-Creative")} onClick={genCounter} dis={mLd} full/>
                </div>
              </div>
            </div>
            {mLd&&<Loader msg={T("يحلل...","Analyzing...")}/>}
            {mRes&&!mLd&&(
              <div className="qa">
                {mRes._source&&(
                  <div style={{padding:"6px 12px",marginBottom:8,borderRadius:6,fontSize:10.5,direction:"rtl",textAlign:"right",background:mRes._source.startsWith("fetched")?"rgba(93,200,122,.06)":"rgba(245,166,35,.06)",border:`1px solid ${mRes._source.startsWith("fetched")?"rgba(93,200,122,.25)":"rgba(245,166,35,.25)"}`,color:mRes._source.startsWith("fetched")?"#5dc87a":"#f5a623"}}>
                    {mRes._source.startsWith("fetched")?T("✓ تم تحليل المحتوى الحقيقي من الرابط","✓ Analyzed real content from URL"):mRes._source.startsWith("inferred")?T("⚠ الرابط محظور — التحليل مبني على افتراضات","⚠ URL blocked — analysis based on inference"):T("✓ تحليل مبني على وصفك","✓ Based on your description")}
                  </div>
                )}
                {/* ── Analysis-only mode ── */}
                {mRes._mode==="analyze"&&(
                  <div style={{...card}}>
                    <div style={{height:3,background:"linear-gradient(90deg,#17a3a3,#f5a623)"}}/>
                    <div style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:11,fontWeight:700,color:"#17a3a3"}}>{mRes.competitor}</span>
                        <Tag ch={mRes.platform}/>
                        {mRes.funnel_stage&&<Tag ch={mRes.funnel_stage}/>}
                        {mRes.angle&&<Tag ch={mRes.angle} t/>}
                      </div>
                      {mRes.summary&&<p className="ai-body" style={{fontSize:11.5,color:"#ddeef4",marginBottom:10}}>{mRes.summary}</p>}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <p className="label">Hook / Headline</p>
                          {mRes.hook&&<p style={{fontSize:11,color:"#f5a623",fontWeight:600,direction:"rtl",textAlign:"right",marginBottom:6}}>{mRes.hook}</p>}
                          <p className="label">Target Audience</p>
                          <p style={{fontSize:10.5,color:"#bbd4e0",direction:"rtl",textAlign:"right",lineHeight:1.6,marginBottom:6}}>{mRes.target_audience||"—"}</p>
                          {(mRes.keywords||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3}}>{(mRes.keywords||[]).slice(0,6).map(k=><Tag key={k} ch={k} style={{fontSize:9}}/>)}</div>}
                        </div>
                        <div>
                          <p className="label" style={{color:"#5dc87a"}}>Strengths</p>
                          {(mRes.strengths||[]).map((s,i)=><p key={i} style={{fontSize:10.5,color:"#5dc87a",direction:"rtl",textAlign:"right",marginBottom:3,lineHeight:1.6}}>✓ {s}</p>)}
                          <p className="label" style={{color:"#f07070",marginTop:8}}>Gaps to Exploit</p>
                          {(mRes.gaps||[]).map((g,i)=><p key={i} style={{fontSize:10.5,color:"#f07070",direction:"rtl",textAlign:"right",marginBottom:3,lineHeight:1.6}}>✗ {g}</p>)}
                        </div>
                      </div>
                      {mRes.qoyod_angle&&<div style={{padding:"10px 12px",borderRadius:6,background:"rgba(23,163,164,.07)",border:"1px solid rgba(23,163,164,.2)"}}>
                        <p className="label" style={{color:"#17a3a3"}}>QOYOD ANGLE</p>
                        <p className="ai-body" style={{fontSize:11.5,color:"#ddeef4"}}>{mRes.qoyod_angle}</p>
                      </div>}
                      <div style={{marginTop:8,display:"flex",gap:6}}>
                        <Btn ch={T("أنشئ نسخة مضادة","Turn Into Counter-Creative")} xs onClick={genCounter}/>
                        <Btn ch={T("نسخ التحليل","Copy Analysis")} xs onClick={()=>copyText(`${mRes.competitor} | ${mRes.platform}\n\nHook: ${mRes.hook}\nAngle: ${mRes.angle}\nAudience: ${mRes.target_audience}\n\nStrengths:\n${(mRes.strengths||[]).map(s=>`• ${s}`).join("\n")}\n\nGaps:\n${(mRes.gaps||[]).map(g=>`• ${g}`).join("\n")}\n\nQoyod Angle: ${mRes.qoyod_angle}`)}/>
                      </div>
                    </div>
                  </div>
                )}
                {/* ── Counter-creative mode ── */}
                {(mRes.cards||[]).map((c,i)=>(
                  <div key={i} style={{...card}}>
                    <div style={cHead}><Tag ch={c.competitor} style={{fontWeight:700}}/><Tag ch={c.platform||mChan} style={{fontSize:10}}/></div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                      <div style={{padding:"12px 13px",borderLeft:"1px solid rgba(1,53,90,.45)"}}>
                        <p style={{fontSize:9,fontWeight:700,color:"#2e5468",marginBottom:8,textTransform:"uppercase"}}>{T("إعلان المنافس","Competitor Ad")}</p>
                        <p className="label">{T("الجملة الافتتاحية","Hook")}</p>
                        <p className="ai-body" style={{fontSize:12,fontWeight:600,color:"#f5a623",marginBottom:10}}>{c.hook}</p>
                        <p className="label">{T("الرسالة","Message")}</p>
                        <p className="ai-body ai-scroll" style={{marginBottom:8}}>{c.message}</p>
                        <div style={{fontSize:10.5,color:"#8aafc4",padding:"7px 10px",background:"rgba(245,166,35,.04)",borderRadius:5,marginBottom:6,lineHeight:1.7,direction:"rtl",textAlign:"right"}}>{c.why_works}</div>
                        <p style={{fontSize:10.5,color:"#f07070",direction:"rtl",textAlign:"right",lineHeight:1.7}}><strong>{T("ثغرة: ","Gap: ")}</strong>{c.weakness}</p>
                      </div>
                      <div style={{padding:"12px 13px"}}>
                        {c.counter?<>
                          <p style={{fontSize:9,fontWeight:700,color:"#2e5468",marginBottom:8,textTransform:"uppercase"}}>{T("نسخة قيود المضادة","Qoyod Counter")}</p>
                          <Hook text={c.counter.hook_ar}/>
                          <p className="ai-body ai-scroll" style={{marginBottom:8}}>{c.counter.body_ar}</p>
                          <div style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}><Tag ch={c.counter.cta_ar} green style={{fontSize:10}}/><Tag ch={c.counter.trust} t style={{fontSize:10}}/><Tag ch={c.counter.funnel} style={{fontSize:10}}/></div>
                          <Btn ch={T("نسخ","Copy")} xs onClick={()=>copyText(`${c.counter.hook_ar}\n\n${c.counter.body_ar}\nCTA: ${c.counter.cta_ar}`)}/>
                        </>:"—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* ══════════════════════════════════════════════════
            EMAIL / WA SEQUENCES
        ══════════════════════════════════════════════════ */}

        {tab==="library"&&(
          <div className="qa">
            <SH title={T("مكتبة الإعلانات","Ad Library")} sub={T("14 إعلاناً مرجعياً","14 reference ads")}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {CREATIVE_LIBRARY.map(ad=>{
                const fCol=ad.funnel==="TOF"?"#f5a623":ad.funnel==="MOF"?"#17a3a3":"#5dc87a";
                const cCol=ad.category.includes("ZATCA")?"#f07070":ad.category.includes("فاتورة")?"#17a3a3":"#6a96aa";
                return(
                  <div key={ad.id} style={{...card,marginBottom:0,cursor:"pointer",transition:"border-color .15s",display:"flex",flexDirection:"column"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(23,163,164,.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(1,53,90,.45)"}>
                    <div style={{height:4,background:`linear-gradient(90deg,${cCol},${fCol})`}}/>
                    <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",flex:1}}>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8,direction:"rtl"}}><Tag ch={ad.id} style={{fontSize:9,fontWeight:700,color:"#f5a623"}}/><Tag ch={ad.category} style={{fontSize:9,color:cCol}}/><Tag ch={ad.funnel} style={{fontSize:9,color:fCol}}/><Tag ch={ad.format} style={{fontSize:9}}/></div>
                      <p style={{fontSize:13,fontWeight:700,direction:"rtl",textAlign:"right",lineHeight:1.5,marginBottom:6}}>{ad.headline}</p>
                      {ad.sub_top&&<p style={{fontSize:10.5,color:"#5dc87a",direction:"rtl",textAlign:"right",marginBottom:2}}>✓ {ad.sub_top}</p>}
                      {ad.sub_bot&&<p style={{fontSize:10.5,color:"#f07070",direction:"rtl",textAlign:"right",marginBottom:6}}>✗ {ad.sub_bot}</p>}
                      {ad.visual&&<p style={{fontSize:9.5,color:"#6a96aa",direction:"rtl",textAlign:"right",marginBottom:8,lineHeight:1.5}}>{ad.visual}</p>}
                      <button
                        onClick={()=>{
                          setExtraNote(`مرجع إعلان ${ad.id}: ${ad.headline}${ad.visual?` — ${ad.visual}`:""}`);
                          setFunnel(ad.funnel);
                          setTab("content");
                        }}
                        style={{width:"100%",padding:"7px 4px",borderRadius:6,border:"1px solid rgba(23,163,164,.35)",background:"rgba(23,163,164,.08)",color:"#17a3a3",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:"auto",paddingTop:7}}
                      >
                        {T("استخدم كمرجع في المحتوى","Use as Content Reference")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab==="icp"&&(
          <div className="qa">
            <SH title={T("شرائح العملاء","Customer Profiles")} sub={T(`${ICP_PERSONAS.length+customPersonas.length} شرائح`,`${ICP_PERSONAS.length+customPersonas.length} personas`)}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
              {[...ICP_PERSONAS,...customPersonas].map((p,idx)=>{
                const tCol=p.tier==="A"?"#17a3a3":"#f5a623";
                const isCustom=idx>=ICP_PERSONAS.length;
                return(
                  <div key={p.id||idx} style={{...card,marginBottom:0,border:isCustom?"1.5px solid rgba(245,166,35,.25)":"1px solid rgba(1,53,90,.45)"}}>
                    <div style={{...cHead,background:`${tCol}08`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{p.icon||"👤"}</span><div><div style={{fontSize:12,fontWeight:700}}>{p.title}</div><div style={{fontSize:9.5,color:"#6a96aa"}}>{p.en||p.title}</div></div></div>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <Tag ch={`Tier ${p.tier}`} style={{fontSize:9.5,color:tCol,fontWeight:700}}/>
                        {isCustom&&<button onClick={()=>setCustomPersonas(prev=>prev.filter((_,i)=>i!==idx-ICP_PERSONAS.length))} style={{background:"none",border:"none",color:"#f07070",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>}
                      </div>
                    </div>
                    <div style={{padding:"12px 14px"}}>
                      <p style={{fontSize:11.5,direction:"rtl",textAlign:"right",lineHeight:1.7,marginBottom:8}}>{p.pain_ar}</p>
                      <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(245,166,35,.05)",borderRadius:6,borderRight:"2px solid #f5a623"}}><p style={{fontSize:12.5,fontWeight:600,color:"#f5a623",direction:"rtl"}}>{p.hook_ar}</p></div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>{setExtraNote(`الجمهور: ${p.title} — ${p.pain_ar}`);setFunnel(p.funnel);setTab("content");}} style={{flex:1,padding:"7px 4px",borderRadius:6,border:"1px solid rgba(23,163,164,.35)",background:"rgba(23,163,164,.08)",color:"#17a3a3",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{T("استخدم في إنشاء المحتوى","Use in Content")}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{...card,marginBottom:0,border:"1.5px dashed rgba(1,53,90,.4)",cursor:"pointer"}} onClick={()=>setShowAddPersona(p=>!p)}>
                <div style={{padding:"20px 14px",textAlign:"center",color:"#2e5468"}}>
                  <div style={{fontSize:24,marginBottom:6}}>+</div>
                  <div style={{fontSize:11.5,fontWeight:600}}>{T("أضف شريحة عميل","Add Custom Persona")}</div>
                </div>
              </div>
            </div>
            {showAddPersona&&(
              <div style={{...card,marginTop:12}}>
                <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#f5a623"}}>{T("شريحة عميل جديدة","New Persona")}</span></div>
                <div style={cBody}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Fld label={T("المسمى الوظيفي (عربي)","Role (Arabic)")}><input value={newPersona.title} onChange={e=>setNewPersona(p=>({...p,title:e.target.value}))} placeholder={T("مثال: مدير التسويق","e.g. مدير التسويق")} dir="rtl"/></Fld>
                    <Fld label={T("المسمى (إنجليزي)","Role (English)")}><input value={newPersona.en} onChange={e=>setNewPersona(p=>({...p,en:e.target.value}))} placeholder="e.g. Marketing Manager"/></Fld>
                  </div>
                  <Fld label={T("المشكلة / نقطة الألم","Pain Point")}><textarea value={newPersona.pain_ar} onChange={e=>setNewPersona(p=>({...p,pain_ar:e.target.value}))} rows={2} dir="rtl" style={{textAlign:"right"}} placeholder={T("ما الذي يؤرقه؟","What is their pain?")}/></Fld>
                  <Fld label={T("الهوك الإعلاني","Hook")}><input value={newPersona.hook_ar} onChange={e=>setNewPersona(p=>({...p,hook_ar:e.target.value}))} placeholder={T("الرسالة الأقوى لهذا الجمهور","The strongest message for this audience")} dir="rtl"/></Fld>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Fld label="Tier"><div style={{display:"flex",gap:4}}>{["A","B"].map(t=><Seg key={t} ch={`Tier ${t}`} on={newPersona.tier===t} onClick={()=>setNewPersona(p=>({...p,tier:t}))}/>)}</div></Fld>
                    <Fld label={T("مرحلة القمع","Funnel")}><div style={{display:"flex",gap:4}}>{["TOF","MOF","BOF"].map(f=><Seg key={f} ch={f} on={newPersona.funnel===f} onClick={()=>setNewPersona(p=>({...p,funnel:f}))}/>)}</div></Fld>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    <Btn ch={T("حفظ الشريحة","Save Persona")} gold onClick={()=>{if(!newPersona.title||!newPersona.pain_ar)return;const id=`CP${customPersonas.length+1}`;setCustomPersonas(prev=>[...prev,{...newPersona,id}]);setNewPersona({title:"",en:"",icon:"👤",tier:"A",pain_ar:"",hook_ar:"",funnel:"TOF",channels:[]});setShowAddPersona(false);}} full/>
                    <Btn ch={T("إلغاء","Cancel")} line onClick={()=>setShowAddPersona(false)} full/>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            A/B VARIANTS
        ══════════════════════════════════════════════════ */}
        {tab==="abtest"&&(
          <div className="qa">
            <SH title={T("توليد نسختين A/B","A/B Copy Variants")} sub={T("نسختان بزاوية مختلفة — أيهما يُحوّل أكثر؟","Two different angles — which one converts better?")}/>
            <ErrBox msg={abErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعدادات الاختبار","Test Settings")}</span></div>
              <div style={cBody}>
                <Fld label={T("المنتج","Product")}><GroupedProductPicker selected={abProd} onSelect={setAbProd} lang={lang}/></Fld>
                <Fld label={T("الفكرة أو الرسالة الأساسية","Core concept or message")}>
                  <textarea value={abConcept} onChange={e=>setAbConcept(e.target.value)} rows={3} dir="rtl" style={{textAlign:"right"}} placeholder={T("مثال: قيود يوفر عليك توظيف محاسب كامل","e.g. Qoyod saves you a full-time accountant cost")}/>
                </Fld>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <Fld label={T("القناة","Channel")}><select value={abChan} onChange={e=>setAbChan(e.target.value)}>{["Instagram","TikTok","Snapchat","Meta","Google","LinkedIn"].map(c=><option key={c}>{c}</option>)}</select></Fld>
                  <Fld label={T("الصيغة","Format")}><select value={abFmt} onChange={e=>setAbFmt(e.target.value)}>{["Static","Reel","Story","Carousel","Video"].map(f=><option key={f}>{f}</option>)}</select></Fld>
                  <Fld label={T("مرحلة الجمهور","Funnel Stage")}><select value={abAud} onChange={e=>setAbAud(e.target.value)}>{["TOF","MOF","BOF"].map(s=><option key={s}>{s}</option>)}</select></Fld>
                </div>
                <Btn ch={abLd?T("يولّد...","Generating..."):`${T("ولّد نسختين","Generate A/B Variants")}`} gold={!abLd} onClick={genAB} dis={abLd} full/>
              </div>
            </div>
            {abLd&&<Loader msg={T("يكتب نسختين بزاوية مختلفة...","Writing two different angles...")}/>}
            {abRes&&!abLd&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                  {["variant_a","variant_b"].map(key=>{
                    const v=abRes[key];if(!v)return null;
                    const isA=key==="variant_a";
                    const accent=isA?"#17a3a3":"#f59e0b";
                    return(
                      <div key={key} style={{...card,marginBottom:0,border:`1.5px solid ${accent}30`}}>
                        <div style={{...cHead,background:`${accent}08`,borderBottom:`1px solid ${accent}20`}}>
                          <span style={{fontSize:12,fontWeight:700,color:accent}}>{v.label||key}</span>
                          <Tag ch={`CTR: ${v.predicted_ctr}`} style={{fontSize:9,background:`${accent}15`,color:accent,border:`1px solid ${accent}30`}}/>
                        </div>
                        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                          <div style={{padding:"8px 10px",background:"rgba(23,163,164,.05)",borderRadius:6,direction:"rtl"}}>
                            <p style={{fontSize:9,color:"#6a96aa",marginBottom:3}}>{T("الهوك","Hook")}</p>
                            <p style={{fontSize:13,fontWeight:700,color:"#ddeef4"}}>{v.hook}</p>
                          </div>
                          <div style={{direction:"rtl"}}>
                            <p style={{fontSize:9,color:"#6a96aa",marginBottom:2}}>{T("الهيدلاين","Headline")}</p>
                            <p style={{fontSize:12,fontWeight:600}}>{v.headline}</p>
                          </div>
                          <div style={{direction:"rtl"}}>
                            <p style={{fontSize:9,color:"#6a96aa",marginBottom:2}}>{T("البودي","Body")}</p>
                            <p style={{fontSize:11.5,lineHeight:1.7}}>{v.body}</p>
                          </div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <Tag ch={`CTA: ${v.cta}`} style={{fontSize:9.5,background:`${accent}12`,color:accent}}/>
                            <Tag ch={v.hook_type} style={{fontSize:9.5}}/>
                            <Tag ch={v.emotional_trigger} style={{fontSize:9.5}}/>
                          </div>
                          <p style={{fontSize:10.5,color:"#5dc87a",direction:"rtl"}}>{v.why}</p>
                          <Btn ch={T("نسخ","Copy")} line onClick={()=>copyText(`${v.hook}\n\n${v.body}\n\n${v.cta}`)} full/>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(abRes.recommendation||abRes.testing_note)&&(
                  <div style={{...card,marginTop:10}}>
                    <div style={cBody}>
                      {abRes.recommendation&&<Row label={T("التوصية","Recommendation")} val={abRes.recommendation}/>}
                      {abRes.testing_note&&<Row label={T("ملاحظة الاختبار","Testing Note")} val={abRes.testing_note}/>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            CONTENT CALENDAR
        ══════════════════════════════════════════════════ */}
        {tab==="calendar"&&(
          <div className="qa">
            <SH title={T("خطة المحتوى الشهرية","Monthly Content Calendar")} sub={T("خطة نشر كاملة بالمنصة والفكرة والكابشن","Full posting plan with platform, topic and caption")}/>
            <ErrBox msg={calErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعدادات الخطة","Plan Settings")}</span></div>
              <div style={cBody}>
                <Fld label={T("المنتج","Product")}><GroupedProductPicker selected={calProd} onSelect={setCalProd} lang={lang} extras={calExtras} onToggleExtra={v=>setCalExtras(prev=>prev.includes(v)?prev.filter(x=>x!==v):[...prev,v])}/></Fld>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Fld label={T("الشهر / الفترة","Month / Period")}><input value={calMonth} onChange={e=>setCalMonth(e.target.value)} placeholder="مايو 2025"/></Fld>
                  <Fld label={T("هدف الخطة","Goal")}><input value={calGoal} onChange={e=>setCalGoal(e.target.value)} placeholder="Awareness + Leads"/></Fld>
                </div>
                <Fld label={T("تكرار النشر","Posting Frequency")}>
                  <select value={calFreq} onChange={e=>setCalFreq(e.target.value)}>
                    {["daily","5 posts/week","4 posts/week","3 posts/week","2 posts/week","1 post/week"].map(f=><option key={f}>{f}</option>)}
                  </select>
                </Fld>
                <Fld label={T("المنصات","Platforms")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                    {["Instagram","TikTok","Snapchat","X (Twitter)","LinkedIn","YouTube Shorts"].map(p=>{
                      const on=calPlatforms.includes(p);
                      return <button key={p} onClick={()=>setCalPlatforms(pr=>on?pr.filter(x=>x!==p):[...pr,p])} style={{padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:on?700:400,border:`1px solid ${on?"rgba(23,163,164,.7)":"rgba(1,53,90,.35)"}`,background:on?"rgba(23,163,164,.15)":"#0a1f3d",color:on?"#17a3a3":"#5a8090",transition:"all .12s"}}>{p}</button>;
                    })}
                  </div>
                </Fld>
                <Btn ch={calLd?T("يبني الخطة...","Building plan..."):`${T("أنشئ الخطة","Generate Calendar")}`} gold={!calLd} onClick={genCalendar} dis={calLd} full/>
              </div>
            </div>
            {calLd&&<Loader msg={T("يبني خطة محتوى شهرية...","Building monthly content plan...")}/>}
            {calRes&&!calLd&&(
              <>
                <div style={{...card,marginTop:10}}>
                  <div style={cHead}>
                    <span style={{fontSize:12,fontWeight:700}}>{calRes.month}</span>
                    <div style={{display:"flex",gap:6}}>
                      <Tag ch={`${calRes.total_posts} posts`}/>
                      <Tag ch={calRes.goal||calGoal}/>
                    </div>
                  </div>
                  <div style={{padding:"10px 14px",display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(calRes.themes||[]).map((t,i)=><Tag key={i} ch={t} style={{fontSize:10.5,background:"rgba(23,163,164,.1)",color:"#17a3a3"}}/>)}
                  </div>
                </div>
                {(calRes.weeks||[]).map(w=>(
                  <div key={w.week} style={{...card,marginTop:10}}>
                    <div style={cHead}><span style={{fontSize:11.5,fontWeight:700}}>{T(`الأسبوع ${w.week}`,`Week ${w.week}`)}</span><Tag ch={`${(w.posts||[]).length} posts`}/></div>
                    <div style={{padding:"0 14px 12px"}}>
                      {(w.posts||[]).map((post,i)=>(
                        <div key={i} style={{padding:"12px 0",borderBottom:"1px solid rgba(1,53,90,.3)"}}>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                            <Tag ch={post.day} style={{background:"rgba(23,163,164,.1)",color:"#17a3a3"}}/>
                            <Tag ch={post.platform}/>
                            <Tag ch={post.format}/>
                            <Tag ch={post.funnel_stage} style={{background:post.funnel_stage==="TOF"?"rgba(96,165,250,.1)":post.funnel_stage==="MOF"?"rgba(245,158,11,.1)":"rgba(16,185,129,.1)",color:post.funnel_stage==="TOF"?"#60a5fa":post.funnel_stage==="MOF"?"#f59e0b":"#10b981"}}/>
                          </div>
                          <p style={{fontSize:12.5,fontWeight:700,color:"#ddeef4",direction:"rtl",marginBottom:4}}>{post.design_text}</p>
                          <p className="ai-body" style={{fontSize:11,color:"#8aafc4",marginBottom:6}}>{post.caption}</p>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontSize:9.5,color:"#2e5468"}}>{post.hashtags}</span>
                            <Tag ch={`CTA: ${post.cta}`} style={{fontSize:9.5,color:"#f59e0b",background:"rgba(245,158,11,.08)"}}/>
                            <Btn ch={T("نسخ","Copy")} line onClick={()=>copyText(`${post.design_text}\n\n${post.caption}\n\n${post.hashtags}`)}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {calRes.hashtag_sets&&(
                  <div style={{...card,marginTop:10}}>
                    <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("مجموعات الهاشتاق","Hashtag Sets")}</span></div>
                    <div style={cBody}>
                      <Row label={T("رئيسي","Main")} val={calRes.hashtag_sets.main}/>
                      <Row label={T("ثانوي","Secondary")} val={calRes.hashtag_sets.secondary}/>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab==="email"&&(
          <div className="qa">
            <SH title={T("رسائل التسويق التسلسلي","Email & WhatsApp Sequences")} sub={T("سلسلة رسائل لكل مرحلة من رحلة العميل","Message sequences for every stage of the customer journey")}/>
            <ErrBox msg={seqErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعدادات السلسلة","Sequence Settings")}</span></div>
              <div style={cBody}>
                <Fld label={T("المنتج","Product")}><GroupedProductPicker selected={seqProd} onSelect={setSeqProd} lang={lang}/></Fld>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Fld label={T("نوع السلسلة","Sequence Type")}>
                    <select value={seqType} onChange={e=>setSeqType(e.target.value)}>
                      <option value="welcome">{T("ترحيب — مستخدم جديد","Welcome — New User")}</option>
                      <option value="nurture">{T("تأهيل — عميل محتمل","Nurture — Warm Lead")}</option>
                      <option value="winback">{T("استعادة — عميل انقطع","Win-back — Lapsed User")}</option>
                      <option value="demo">{T("متابعة بعد الديمو","Post-Demo Follow-up")}</option>
                      <option value="announcement">{T("إعلان ميزة جديدة","Feature Announcement")}</option>
                    </select>
                  </Fld>
                  <Fld label={T("القناة","Channel")}>
                    <select value={seqChannel} onChange={e=>setSeqChannel(e.target.value)}>
                      <option value="email">{T("بريد إلكتروني","Email")}</option>
                      <option value="whatsapp">{T("واتساب","WhatsApp")}</option>
                      <option value="sms">SMS</option>
                    </select>
                  </Fld>
                </div>
                <Fld label={T(`عدد الرسائل (${seqSteps})`,`Number of messages (${seqSteps})`)}>
                  <input type="range" min={2} max={6} value={seqSteps} onChange={e=>setSeqSteps(Number(e.target.value))} style={{padding:"8px 0",background:"none",border:"none",cursor:"pointer"}}/>
                </Fld>
                <Btn ch={seqLd?T("يكتب السلسلة...","Writing sequence..."):`${T("ولّد السلسلة","Generate Sequence")}`} gold={!seqLd} onClick={genSeq} dis={seqLd} full/>
              </div>
            </div>
            {seqLd&&<Loader msg={T("يكتب السلسلة...","Writing the sequence...")}/>}
            {seqRes&&!seqLd&&(
              <>
                <div style={{...card,marginTop:10}}>
                  <div style={cHead}>
                    <span style={{fontSize:12,fontWeight:700}}>{seqRes.sequence_name}</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <Tag ch={seqRes.channel}/><Tag ch={seqRes.type}/>
                      <button onClick={()=>uploadToDrive((seqRes.messages||[]).map((m,i)=>`[${T("رسالة","Message")} ${m.step}] ${m.send_timing||""}\n${T("الموضوع","Subject")}: ${m.subject||""}\n\n${m.body||m.content||""}\n\n${"─".repeat(40)}`).join("\n\n"),"qoyod-email-sequence.txt","text/plain","seq")} disabled={driveLd["seq"]} style={{padding:"3px 8px",borderRadius:4,border:"1px solid rgba(66,133,244,.4)",background:"rgba(66,133,244,.1)",color:driveLinks["seq"]?"#5dc87a":"#4285f4",fontSize:9.5,cursor:"pointer",fontFamily:"inherit",fontWeight:600,opacity:driveLd["seq"]?.6:1}}>
                        {driveLd["seq"]?"↑…":driveLinks["seq"]?<a href={driveLinks["seq"]} target="_blank" rel="noreferrer" style={{color:"#5dc87a",textDecoration:"none"}}>✓ Drive</a>:"☁ Drive"}
                      </button>
                    </div>
                  </div>
                </div>
                {(seqRes.messages||[]).map((msg,i)=>(
                  <div key={i} style={{...card,marginTop:8}}>
                    <div style={{...cHead,background:"rgba(23,163,164,.05)"}}>
                      <span style={{fontSize:11.5,fontWeight:700,color:"#17a3a3"}}>{T(`رسالة ${msg.step}`,`Message ${msg.step}`)}</span>
                      <div style={{display:"flex",gap:6}}>
                        <Tag ch={msg.send_timing} style={{fontSize:9.5,color:"#f59e0b",background:"rgba(245,158,11,.08)"}}/>
                        <Tag ch={msg.tone||""} style={{fontSize:9.5}}/>
                      </div>
                    </div>
                    <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
                      {msg.subject&&<Row label={T("الموضوع","Subject")} val={msg.subject}/>}
                      {msg.preview_text&&<Row label={T("نص المعاينة","Preview Text")} val={msg.preview_text}/>}
                      <div style={{padding:"10px 12px",background:"rgba(7,22,48,.6)",borderRadius:6}}>
                        <p className="ai-body" style={{fontSize:12,color:"#ddeef4"}}>{msg.body}</p>
                      </div>
                      {msg.cta&&<Row label="CTA" val={msg.cta}/>}
                      {msg.goal&&<p style={{fontSize:10,color:"#5dc87a",direction:"rtl"}}>{T("الهدف: ","Goal: ")}{msg.goal}</p>}
                      <Btn ch={T("نسخ الرسالة","Copy Message")} line onClick={()=>copyText(`${msg.subject?`Subject: ${msg.subject}\n`:""}${msg.body}\n\n${msg.cta||""}`)} full/>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}


        {/* ══════════════════════════════════════════════════
            AD SPEC SHEET
        ══════════════════════════════════════════════════ */}
        {tab==="adspec"&&(
          <div className="qa">
            <SH title={T("مواصفات الإعلان","Ad Spec Sheet")} sub={T("الأبعاد والقيود لكل منصة — مرجع جاهز للمصمم","Dimensions and limits per platform — ready reference for the designer")}/>
            <ErrBox msg={specErr}/>
            <div style={card}>
              <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("إعدادات","Settings")}</span></div>
              <div style={cBody}>
                <Fld label={T("المنتج","Product")}><GroupedProductPicker selected={specProd} onSelect={setSpecProd} lang={lang}/></Fld>
                <Fld label={T("الهدف التسويقي","Campaign Goal")}><select value={specGoal} onChange={e=>setSpecGoal(e.target.value)}>{["Leads","Awareness","Sales","App Installs","Traffic"].map(g=><option key={g}>{g}</option>)}</select></Fld>
                <Fld label={T("المنصات","Platforms")}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                    {["Meta","TikTok","Snapchat","Google","LinkedIn","X (Twitter)","YouTube"].map(p=>{
                      const on=specPlatforms.includes(p);
                      return <button key={p} onClick={()=>setSpecPlatforms(pr=>on?pr.filter(x=>x!==p):[...pr,p])} style={{padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:on?700:400,border:`1px solid ${on?"rgba(23,163,164,.7)":"rgba(1,53,90,.35)"}`,background:on?"rgba(23,163,164,.15)":"#0a1f3d",color:on?"#17a3a3":"#5a8090",transition:"all .12s"}}>{p}</button>;
                    })}
                  </div>
                </Fld>
                <Btn ch={specLd?T("يجهّز المواصفات...","Generating specs..."):`${T("أنشئ مواصفات الإعلان","Generate Ad Specs")}`} gold={!specLd} onClick={genSpec} dis={specLd} full/>
              </div>
            </div>
            {specLd&&<Loader msg={T("يجهّز مواصفات لكل منصة...","Generating specs for each platform...")}/>}
            {specRes&&!specLd&&(
              <>
                {specRes.brand_quick_ref&&(
                  <div style={{...card,marginTop:10}}>
                    <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("الهوية البصرية السريعة","Brand Quick Ref")}</span></div>
                    <div style={cBody}>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:5,background:"#021544",border:"1px solid rgba(255,255,255,.1)"}}><div style={{width:12,height:12,borderRadius:2,background:"#021544",border:"1px solid #fff"}}><span style={{fontSize:0}}>.</span></div><span style={{fontSize:10,color:"#fff"}}>Navy #021544</span></div>
                        <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:5,background:"rgba(23,163,164,.15)",border:"1px solid rgba(23,163,164,.3)"}}><div style={{width:12,height:12,borderRadius:2,background:"#17A3A4"}}><span style={{fontSize:0}}>.</span></div><span style={{fontSize:10,color:"#17a3a3"}}>Teal #17A3A4</span></div>
                      </div>
                      <Row label={T("الخط","Font")} val={specRes.brand_quick_ref.font}/>
                      <Row label={T("موضع الشعار","Logo Placement")} val={specRes.brand_quick_ref.logo_placement}/>
                      <Row label={T("أسلوب الصوت","Tone")} val={specRes.brand_quick_ref.tone}/>
                    </div>
                  </div>
                )}
                {(specRes.platforms||[]).map(plat=>(
                  <div key={plat.platform} style={{...card,marginTop:10}}>
                    <div style={cHead}><span style={{fontSize:12,fontWeight:700,color:"#17a3a3"}}>{plat.platform}</span></div>
                    <div style={{padding:"0 14px 12px"}}>
                      {(plat.formats||[]).map((fmt,i)=>(
                        <div key={i} style={{padding:"12px 0",borderBottom:"1px solid rgba(1,53,90,.25)"}}>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                            <Tag ch={fmt.format} style={{fontWeight:700,color:"#17a3a3",background:"rgba(23,163,164,.1)"}}/>
                            <Tag ch={fmt.dimensions||fmt.aspect_ratio}/>
                            {fmt.duration&&<Tag ch={fmt.duration}/>}
                            {fmt.max_file_size&&<Tag ch={fmt.max_file_size}/>}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:6}}>
                            {fmt.headline_chars&&<p style={{fontSize:10.5,color:"#6a96aa"}}>{T("هيدلاين: ","Headline: ")}<span style={{color:"#ddeef4",fontWeight:600}}>{fmt.headline_chars}</span></p>}
                            {fmt.body_chars&&<p style={{fontSize:10.5,color:"#6a96aa"}}>{T("نص: ","Body: ")}<span style={{color:"#ddeef4",fontWeight:600}}>{fmt.body_chars}</span></p>}
                            {fmt.text_limit&&<p style={{fontSize:10.5,color:"#6a96aa"}}>{T("حد النص: ","Text limit: ")}<span style={{color:"#ddeef4",fontWeight:600}}>{fmt.text_limit}</span></p>}
                            {fmt.safe_zone&&<p style={{fontSize:10.5,color:"#6a96aa"}}>{T("منطقة آمنة: ","Safe zone: ")}<span style={{color:"#ddeef4",fontWeight:600}}>{fmt.safe_zone}</span></p>}
                          </div>
                          <p style={{fontSize:11.5,direction:"rtl",color:"#ddeef4",marginBottom:4}}>{fmt.creative_direction}</p>
                          {fmt.dos?.length>0&&<p style={{fontSize:10.5,color:"#5dc87a",direction:"rtl"}}>{T("يجب: ","Do: ")}{fmt.dos.join(" · ")}</p>}
                          {fmt.donts?.length>0&&<p style={{fontSize:10.5,color:"#f07070",direction:"rtl"}}>{T("تجنب: ","Don't: ")}{fmt.donts.join(" · ")}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(specRes.global_dos?.length>0||specRes.global_donts?.length>0)&&(
                  <div style={{...card,marginTop:10}}>
                    <div style={cHead}><span style={{fontSize:11,fontWeight:600,color:"#6a96aa"}}>{T("قواعد عامة","Global Rules")}</span></div>
                    <div style={cBody}>
                      {specRes.global_dos?.length>0&&<div style={{marginBottom:8}}><p style={{fontSize:10,color:"#5dc87a",marginBottom:4}}>{T("يجب دائماً","Always do")}</p>{specRes.global_dos.map((d,i)=><p key={i} style={{fontSize:11.5,direction:"rtl",padding:"3px 0",color:"#ddeef4"}}>{d}</p>)}</div>}
                      {specRes.global_donts?.length>0&&<div><p style={{fontSize:10,color:"#f07070",marginBottom:4}}>{T("تجنب دائماً","Never do")}</p>{specRes.global_donts.map((d,i)=><p key={i} style={{fontSize:11.5,direction:"rtl",padding:"3px 0",color:"#ddeef4"}}>{d}</p>)}</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            AGENT DASHBOARD TAB
            ══════════════════════════════════════════════════ */}
        {tab==="agent"&&(
          <div style={{animation:"qrise .3s ease both"}}>

            {/* ── Health bar ── */}
            {agentStatus&&(
              <div style={{...card,marginBottom:10}}>
                <div style={{...cHead,paddingTop:10,paddingBottom:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#6a96aa",letterSpacing:".04em",textTransform:"uppercase"}}>{T("حالة النظام","System Health")}</span>
                  <span style={{fontSize:9.5,color:"#2e5468"}}>{T(`${agentStatus.tasks_in_memory} مهمة محفوظة`,`${agentStatus.tasks_in_memory} tasks stored`)}</span>
                </div>
                <div style={{...cBody,display:"flex",flexWrap:"wrap",gap:8}}>
                  {[
                    {label:"Claude AI",   ok:agentStatus.configured?.anthropic},
                    {label:"Gemini",      ok:agentStatus.configured?.gemini},
                    {label:"Drive",       ok:agentStatus.configured?.drive},
                    {label:"Slack",       ok:agentStatus.configured?.slack_reply},
                    {label:"HubSpot",     ok:agentStatus.configured?.hubspot},
                  ].map(s=>(
                    <div key={s.label} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,border:`1px solid ${s.ok?"rgba(93,200,122,.25)":"rgba(240,112,112,.2)"}`,background:s.ok?"rgba(93,200,122,.04)":"rgba(240,112,112,.04)"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:s.ok?"#5dc87a":"#f07070",flexShrink:0}}/>
                      <span style={{fontSize:10,fontWeight:600,color:s.ok?"#5dc87a":"#f07070"}}>{s.label}</span>
                    </div>
                  ))}
                  {agentCtx?.ok&&(
                    <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,border:`1px solid ${agentCtx.age_hours<168?"rgba(23,163,164,.25)":"rgba(245,166,35,.25)"}`,background:`rgba(23,163,164,.04)`}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:agentCtx.age_hours<168?"#17a3a3":"#f5a623",flexShrink:0}}/>
                      <span style={{fontSize:10,fontWeight:600,color:agentCtx.age_hours<168?"#17a3a3":"#f5a623"}}>
                        {T(`سياق المنافسين · منذ ${agentCtx.age_hours}س`,`Competitor ctx · ${agentCtx.age_hours}h ago`)}
                      </span>
                    </div>
                  )}
                  {agentPatStats?.ok&&(
                    <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(245,166,35,.25)",background:"rgba(245,166,35,.04)"}}>
                      <span style={{fontSize:10,fontWeight:600,color:"#f5a623"}}>
                        {T(`مكتبة الأنماط · ${agentPatStats.win_count} فائز`,`Pattern Library · ${agentPatStats.win_count} wins`)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Two-column: Run + Schedules ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>

              {/* Manual Run */}
              <div style={card}>
                <div style={cHead}>
                  <span style={{fontSize:11,fontWeight:700,color:"#6a96aa",letterSpacing:".04em",textTransform:"uppercase"}}>{T("تشغيل يدوي","Run Agent")}</span>
                </div>
                <div style={cBody}>
                  <Fld label={T("الشخصية","Persona")}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {(agentPersonas.length?agentPersonas:[
                        {id:"orchestrator",label:"المنسق",label_en:"Orchestrator"},
                        {id:"social_media",label:"السوشيال",label_en:"Social"},
                        {id:"content_creator",label:"المحتوى",label_en:"Content"},
                        {id:"cro",label:"الإعلانات",label_en:"Paid Media"},
                        {id:"email_lifecycle",label:"البريد",label_en:"Email"},
                        {id:"editor_qa",label:"المدقق",label_en:"Editor QA"},
                      ]).map(p=>(
                        <button key={p.id} onClick={()=>setAgentRunPersona(p.id)} style={{padding:"4px 9px",borderRadius:5,fontFamily:"inherit",fontSize:10,cursor:"pointer",border:`1px solid ${agentRunPersona===p.id?"rgba(23,163,164,.5)":"rgba(1,53,90,.45)"}`,background:agentRunPersona===p.id?"rgba(23,163,164,.1)":"transparent",color:agentRunPersona===p.id?"#17a3a3":"#6a96aa",fontWeight:agentRunPersona===p.id?600:400,transition:"all .12s"}}>
                          {lang==="ar"?p.label:p.label_en}
                        </button>
                      ))}
                    </div>
                  </Fld>
                  <Fld label={T("المهمة","Task")}>
                    <textarea
                      value={agentRunPrompt}
                      onChange={e=>setAgentRunPrompt(e.target.value)}
                      rows={4}
                      dir={dir}
                      placeholder={T("مثال: اكتب 3 كابشن إنستغرام لـ QFlavours زاوية الخوف من ZATCA","e.g. Write 3 Instagram captions for QFlavours with ZATCA fear angle")}
                      style={{width:"100%",fontFamily:"inherit",fontSize:11.5,padding:"8px 10px",borderRadius:6,border:"1px solid rgba(1,53,90,.45)",background:"#0a1f3d",color:"#ddeef4",resize:"vertical",textAlign:lang==="ar"?"right":"left"}}
                    />
                  </Fld>
                  {agentRunErr&&<ErrBox msg={agentRunErr}/>}
                  {agentRunResult&&(
                    <div style={{padding:"7px 10px",borderRadius:6,background:"rgba(93,200,122,.06)",border:"1px solid rgba(93,200,122,.2)",fontSize:10.5,color:"#5dc87a",marginBottom:8}}>
                      {T("✓ قيد التنفيذ — Task ID: ","✓ Running — Task ID: ")}{agentRunResult.task_id}
                    </div>
                  )}
                  <Btn ch={agentRunning?T("يعمل...","Running..."):T("تشغيل الوكيل","Run Agent")} onClick={runAgent} dis={agentRunning||!agentRunPrompt.trim()} full/>
                </div>
              </div>

              {/* Scheduled Jobs */}
              <div style={card}>
                <div style={cHead}>
                  <span style={{fontSize:11,fontWeight:700,color:"#6a96aa",letterSpacing:".04em",textTransform:"uppercase"}}>{T("المهام المجدولة","Scheduled Jobs")}</span>
                  <span style={{fontSize:9.5,color:"#2e5468"}}>{agentSchedules.length} {T("جدول","jobs")}</span>
                </div>
                <div style={cBody}>
                  {/* Fixed system jobs */}
                  {[
                    {name:T("رصد المنافسين الأسبوعي","Weekly Competitor Monitor"),when:T("الأحد 09:00 UTC","Sunday 09:00 UTC"),action:()=>fetch("/api/competitor-ads/run-monitor-now",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({postToSlack:false})}).then(r=>r.json()).then(j=>alert(j.week||j.error))},
                    {name:T("ملخص Slack اليومي","Daily Slack Digest"),when:T("يومياً","Daily"),action:()=>fetch("/api/agent/weekly-digest/run-now",{method:"POST"}).then(r=>r.json()).then(j=>alert(j.ok?"Sent":"Failed: "+j.error))},
                    {name:T("مسح المنافسين","Competitor Poll"),when:T("كل ساعة","Hourly"),action:()=>fetch("/api/agent/competitor/poll-now",{method:"POST"}).then(r=>r.json()).then(j=>alert(j.ok?"Done":"Failed: "+j.error))},
                  ].map((j,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<2?"1px solid rgba(1,53,90,.25)":"none"}}>
                      <div>
                        <p style={{fontSize:11,fontWeight:600,color:"#ddeef4",margin:0}}>{j.name}</p>
                        <p style={{fontSize:9.5,color:"#2e5468",margin:0}}>{j.when}</p>
                      </div>
                      <button onClick={j.action} style={{padding:"4px 9px",borderRadius:5,fontFamily:"inherit",fontSize:10,cursor:"pointer",border:"1px solid rgba(23,163,164,.3)",background:"rgba(23,163,164,.08)",color:"#17a3a3",fontWeight:600}}>
                        {T("شغّل","Run")}
                      </button>
                    </div>
                  ))}
                  {/* Dynamic schedules */}
                  {agentSchedules.length>0&&(
                    <div style={{marginTop:10}}>
                      <p style={{fontSize:9.5,color:"#2e5468",marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>{T("مجدولة ديناميكية","Dynamic Schedules")}</p>
                      {agentSchedules.slice(0,4).map(s=>(
                        <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(1,53,90,.2)"}}>
                          <div>
                            <p style={{fontSize:10.5,fontWeight:600,color:"#ddeef4",margin:0}}>{s.name}</p>
                            {s.next_run_at&&<p style={{fontSize:9,color:"#2e5468",margin:0}}>{T("التالي: ","Next: ")}{new Date(s.next_run_at).toLocaleTimeString()}</p>}
                          </div>
                          <div style={{width:8,height:8,borderRadius:"50%",background:s.active?"#5dc87a":"#f07070"}}/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Task Feed ── */}
            <div style={card}>
              <div style={cHead}>
                <span style={{fontSize:11,fontWeight:700,color:"#6a96aa",letterSpacing:".04em",textTransform:"uppercase"}}>{T("سجل المهام","Task Feed")}</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {agentTasks.some(t=>["running","thinking","queued"].includes(t.status))&&(
                    <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9.5,color:"#17a3a3"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:"#17a3a3",animation:"qspin 1.5s linear infinite"}}/>
                      {T("نشط","Live")}
                    </div>
                  )}
                  <span style={{fontSize:9.5,color:"#2e5468"}}>{agentTasks.length} {T("مهمة","tasks")}</span>
                </div>
              </div>
              <div style={cBody}>
                {agentTasks.length===0&&(
                  <p style={{fontSize:11,color:"#2e5468",textAlign:"center",padding:"20px 0"}}>{T("لا توجد مهام بعد — استخدم 'تشغيل يدوي' أعلاه","No tasks yet — use the Run panel above")}</p>
                )}
                {agentTasks.map(t=>{
                  const statusColor={queued:"#f5a623",thinking:"#17a3a3",running:"#17a3a3",done:"#5dc87a",error:"#f07070"}[t.status]||"#6a96aa";
                  const statusLabel={queued:T("في الانتظار","Queued"),thinking:T("يفكر","Thinking"),running:T("يعمل","Running"),done:T("منتهية","Done"),error:T("خطأ","Error")}[t.status]||t.status;
                  const isLive=t.status==="running"||t.status==="thinking";
                  const isExpanded=agentExpandedTask===t.id;
                  return(
                    <div key={t.id}>
                      <div
                        onClick={()=>loadTaskDetail(t.id)}
                        style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 0",borderBottom:"1px solid rgba(1,53,90,.25)",cursor:"pointer",transition:"background .12s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(23,163,164,.03)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      >
                        <div style={{width:8,height:8,borderRadius:"50%",background:statusColor,flexShrink:0,marginTop:3,animation:isLive?"qspin 1.5s linear infinite":"none"}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                            <span style={{fontSize:10,fontWeight:600,color:statusColor,padding:"1px 5px",borderRadius:3,border:`1px solid ${statusColor}30`,background:`${statusColor}08`}}>{statusLabel}</span>
                            {t.persona&&<span style={{fontSize:9.5,color:"#2e5468"}}>{t.persona}</span>}
                            {t.steps>0&&<span style={{fontSize:9.5,color:"#2e5468"}}>{t.steps} {T("خطوة","steps")}</span>}
                          </div>
                          <p style={{fontSize:11.5,color:"#ddeef4",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",direction:dir}}>{t.title||"(no title)"}</p>
                          {t.summary&&!isExpanded&&<p style={{fontSize:10,color:"#6a96aa",margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",direction:"ltr"}}>{t.summary}</p>}
                        </div>
                        <span style={{fontSize:9,color:"#2e5468",flexShrink:0,marginTop:2}}>{new Date(t.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                      </div>

                      {/* Expanded task detail */}
                      {isExpanded&&(
                        <div style={{background:"#050f22",borderRadius:6,margin:"0 0 4px 18px",padding:"10px 12px",fontSize:10.5,direction:"ltr"}}>
                          {!agentTaskDetail&&<p style={{color:"#2e5468"}}>Loading…</p>}
                          {agentTaskDetail&&agentTaskDetail.id===t.id&&(
                            <>
                              {agentTaskDetail.summary&&(
                                <div style={{marginBottom:8,padding:"6px 8px",borderRadius:5,background:"rgba(93,200,122,.05)",border:"1px solid rgba(93,200,122,.15)"}}>
                                  <p style={{fontSize:10,color:"#5dc87a",fontWeight:600,marginBottom:3}}>Summary</p>
                                  <p style={{color:"#b0c8d4",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{agentTaskDetail.summary}</p>
                                </div>
                              )}
                              {agentTaskDetail.error&&(
                                <div style={{marginBottom:8,padding:"6px 8px",borderRadius:5,background:"rgba(240,112,112,.05)",border:"1px solid rgba(240,112,112,.15)"}}>
                                  <p style={{fontSize:10,color:"#f07070",fontWeight:600,marginBottom:3}}>Error</p>
                                  <p style={{color:"#f07070",lineHeight:1.5}}>{agentTaskDetail.error}</p>
                                </div>
                              )}
                              {(agentTaskDetail.steps||[]).length>0&&(
                                <div>
                                  <p style={{fontSize:10,color:"#6a96aa",fontWeight:600,marginBottom:6}}>Steps ({agentTaskDetail.steps.length})</p>
                                  {agentTaskDetail.steps.map((s,i)=>(
                                    <div key={i} style={{display:"flex",gap:8,marginBottom:4,paddingBottom:4,borderBottom:"1px solid rgba(1,53,90,.2)"}}>
                                      <span style={{fontSize:9,color:"#2e5468",flexShrink:0,marginTop:1}}>{new Date(s.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
                                      <div>
                                        <span style={{fontSize:9.5,fontWeight:600,color:{think:"#f5a623",tool_use:"#17a3a3",tool_result:"#5dc87a",finish:"#5dc87a",error:"#f07070"}[s.kind]||"#6a96aa",marginRight:6}}>{s.kind}</span>
                                        {s.tool&&<span style={{fontSize:9.5,color:"#2e5468"}}>[{s.tool}]</span>}
                                        {s.message&&<p style={{margin:"2px 0 0",color:"#8aafc4",lineHeight:1.5,fontSize:10}}>{String(s.message).slice(0,200)}{s.message.length>200?"…":""}</p>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* ══════════════════════════════════════════════════
            HYPOTHESIS LOG MODAL (D1 — Pattern Library foundation)
            ══════════════════════════════════════════════════ */}
        {hypModalOpen&&(
          <div onClick={()=>!hypLd&&setHypModalOpen(false)} style={{position:"fixed",inset:0,background:"rgba(2,12,30,.85)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{...card,width:"100%",maxWidth:520,marginBottom:0,direction:dir}}>
              <div style={cHead}>
                <span style={{fontSize:11.5,fontWeight:700,color:"#f5a623"}}>{T("سجّل هذا كاختبار","Log This as a Test")}</span>
                <button onClick={()=>setHypModalOpen(false)} disabled={hypLd} style={{background:"none",border:"none",color:"#6a96aa",fontSize:14,cursor:"pointer"}}>✕</button>
              </div>
              <div style={cBody}>
                <p style={{fontSize:10.5,color:"#6a96aa",marginBottom:10,lineHeight:1.6,direction:dir}}>{T("الفرضيات تتراكم في 'مكتبة الأنماط' — كل WIN يصير قدوة للأجيال القادمة.","Hypotheses compound into the Pattern Library — every WIN seeds future generations.")}</p>
                <Fld label={T("الفرضية (If X then Y because Z)","Hypothesis (If X then Y because Z)")}>
                  <textarea value={hypText} onChange={e=>setHypText(e.target.value)} rows={3} dir={dir} style={{textAlign:lang==="ar"?"right":"left",fontFamily:"inherit",fontSize:11.5,padding:"8px 10px",borderRadius:6,border:"1px solid rgba(245,166,35,.3)",background:"#0a1f3d",color:"#ddeef4",resize:"vertical",width:"100%"}} placeholder={T("مثال: زاوية الخوف من غرامة ZATCA تتفوق على البساطة لتجار التجزئة في الرياض","e.g. Fear angle on ZATCA fines outperforms simplicity for Tier-A retail")}/>
                </Fld>
                <Fld label={T("التأثير المتوقع","Expected Lift")}>
                  <input value={hypExpectedLift} onChange={e=>setHypExpectedLift(e.target.value)} placeholder={T("مثال: +15% CTR vs control","e.g. +15% CTR vs control")} style={{width:"100%",fontFamily:"inherit"}}/>
                </Fld>
                <p style={{fontSize:10,color:"#2e5468",marginBottom:8,direction:dir}}>{T(`السياق التلقائي: قناة=${chan} · قطاع=${sector} · مرحلة=${funnel}`,`Auto-context: channel=${chan} · sector=${sector} · funnel=${funnel}`)}</p>
                {hypMsg&&<div style={{padding:"6px 10px",fontSize:10.5,borderRadius:5,background:hypMsg.startsWith("✓")?"rgba(93,200,122,.08)":"rgba(240,112,112,.08)",border:`1px solid ${hypMsg.startsWith("✓")?"rgba(93,200,122,.3)":"rgba(240,112,112,.3)"}`,color:hypMsg.startsWith("✓")?"#5dc87a":"#f07070",marginBottom:8}}>{hypMsg}</div>}
                <div style={{display:"flex",gap:6}}>
                  <Btn ch={hypLd?T("يحفظ...","Saving..."):T("احفظ في السجل","Save to Ledger")} gold onClick={submitHypothesis} dis={hypLd||!hypText.trim()} full/>
                  <Btn ch={T("إلغاء","Cancel")} line onClick={()=>setHypModalOpen(false)} dis={hypLd}/>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
