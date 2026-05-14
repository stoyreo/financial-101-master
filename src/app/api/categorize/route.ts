import { NextResponse } from 'next/server';

export const runtime = 'edge';

// ── Keyword rules ──────────────────────────────────────────────────────────
// Each rule: { patterns: string[], category: string }
// Patterns are lower-cased substrings matched against the input text.
// Order matters — first match wins.
// ─────────────────────────────────────────────────────────────────────────

const RULES: { patterns: string[]; category: string }[] = [
  // ── Food & Dining ──────────────────────────────────────────────────────
  {
    category: 'Food',
    patterns: [
      // Meals (EN)
      'lunch', 'dinner', 'breakfast', 'brunch', 'supper', 'meal', 'eat',
      'food', 'snack', 'dessert', 'pastry', 'bakery', 'bread', 'cake',
      // Beverages
      'coffee', 'cafe', 'caffè', 'latte', 'cappuccino', 'espresso',
      'tea', 'boba', 'bubble tea', 'milk tea', 'ชานม', 'ชา',
      'juice', 'smoothie', 'drink', 'beverage', 'water bottle',
      'beer', 'wine', 'alcohol', 'bar ',
      // Thai meals
      'ข้าว', 'ก๋วยเตี๋ยว', 'ก๋วยจั๊บ', 'ผัดไทย', 'ต้มยำ', 'แกง',
      'ส้มตำ', 'ลาบ', 'น้ำพริก', 'ข้าวมันไก่', 'ข้าวหมูแดง',
      'ข้าวหมูกรอบ', 'หมูปิ้ง', 'ไก่ย่าง', 'ปลาเผา', 'ยำ',
      'ต้มข่า', 'มะม่วง', 'ผลไม้', 'ของหวาน', 'ไอติม', 'ไอศกรีม',
      // Asian cuisines / chains
      'sushi', 'ramen', 'pho', 'dim sum', 'dimsum', 'hotpot', 'shabu',
      'ชาบู', 'หมูกระทะ', 'yakiniku', 'bbq', 'buffet', 'บุฟเฟ่',
      'mk restaurant', 'mk suki', 'coca', 'sizzler',
      'pizza', 'pasta', 'burger', 'sandwich', 'taco', 'wrap',
      'fried rice', 'noodle', 'pork', 'chicken', 'beef', 'fish',
      'shrimp', 'seafood', 'salad', 'soup',
      // Global fast food & cafes
      'mcdonald', 'kfc', 'burger king', 'subway', 'domino', 'pizza hut',
      'the pizza company', 'starbucks', 'true coffee', 'cafe amazon',
      'amazon coffee', 'อเมซอน', 'กาแฟ', 'inthanin', 'คอฟฟี่',
      'dunkin', 'krispy kreme', 'swensen', 'dairy queen', 'dq',
      'au bon pain', 'paul', 'greyhound cafe',
      'after you', 'red cup', 'black canyon',
      // Grocery / convenience
      'grocery', 'supermarket', 'market', 'ตลาด', 'ซื้อของ',
      '7-eleven', '7eleven', 'seven eleven', 'familymart', 'lawson',
      'mini bigc', 'tops daily',
      // Delivery apps (food intent)
      'grab food', 'grabfood', 'foodpanda', 'lineman', 'robinhood food',
    ],
  },

  // ── Transport ─────────────────────────────────────────────────────────
  {
    category: 'Transport',
    patterns: [
      'grab', 'bolt', 'uber', 'taxi', 'แท็กซี่', 'แกร็บ',
      'bts', 'mrt', 'airport rail', 'arl', 'mtr',
      'bus', 'van', 'รถตู้', 'รถเมล์', 'รถสองแถว',
      'motorcycle taxi', 'มอเตอร์ไซค์', 'วิน', 'moto',
      'train', 'รถไฟ', 'เรือ', 'boat', 'ferry',
      'airasia', 'thai airways', 'thai lion', 'nok air', 'bangkok airways',
      'scoot', 'vietjet', 'flight', 'airline', 'บัตรโดยสาร',
      'fuel', 'gasoline', 'petrol', 'น้ำมัน', 'เบนซิน',
      'ptt', 'shell', 'esso', 'caltex', 'bcp',
      'parking', 'จอดรถ', 'ที่จอด',
      'toll', 'ด่าน', 'ทางด่วน', 'expressway',
      'car wash', 'ล้างรถ',
      'transport', 'commute', 'fare', 'ticket',
    ],
  },

  // ── Shopping ──────────────────────────────────────────────────────────
  {
    category: 'Shopping',
    patterns: [
      'shopee', 'lazada', 'amazon', 'temu',
      'central', 'centralworld', 'central embassy', 'central chidlom',
      'the mall', 'siam paragon', 'emquartier', 'emsphere', 'icon siam',
      'big c', 'lotus', 'makro', 'global house', 'homepro', 'bnn',
      'ikea', 'index living', 'uniqlo', 'zara', 'h&m', 'muji',
      'tops', 'villa market', 'gourmet market',
      'boots', 'watsons',
      'clothes', 'clothing', 'shirt', 'shoes', 'bag', 'fashion',
      'เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'แว่น',
      'accessories', 'jewelry', 'watch', 'นาฬิกา',
      'gadget', 'phone', 'laptop', 'computer', 'tablet',
      'apple', 'samsung', 'iphone', 'ipad',
      'book', 'stationery', 'office supply', 'เครื่องเขียน',
      'gift', 'ของขวัญ', 'souvenir',
      'online shop', 'ช้อปปิ้ง', 'ซื้อของออนไลน์',
    ],
  },

  // ── Utilities ─────────────────────────────────────────────────────────
  {
    category: 'Utilities',
    patterns: [
      'electricity', 'electric bill', 'ค่าไฟ', 'การไฟฟ้า', 'pea', 'mea',
      'water bill', 'ค่าน้ำ', 'การประปา',
      'internet', 'wifi', 'broadband', 'fiber',
      'phone bill', 'mobile bill', 'ค่าโทรศัพท์', 'ค่าเน็ต',
      'ais', 'dtac', 'true move', 'ntrue', '3bb', 'tot', 'nt',
      'netflix', 'youtube premium', 'spotify', 'apple music',
      'disney+', 'hbo', 'prime video', 'viu', 'wetv',
      'line tv', 'linetv',
      'icloud', 'google one', 'dropbox', 'microsoft 365',
      'gas bill', 'ค่าแก๊ส', 'ptt gas',
      'subscription', 'monthly fee', 'annual fee', 'membership fee',
      'ค่าสมาชิก', 'รายเดือน', 'รายปี',
    ],
  },

  // ── Health ────────────────────────────────────────────────────────────
  {
    category: 'Health',
    patterns: [
      'hospital', 'clinic', 'โรงพยาบาล', 'คลินิก',
      'doctor', 'physician', 'แพทย์', 'หมอ', 'พบแพทย์',
      'dentist', 'dental', 'ทันตกรรม', 'ฟัน',
      'pharmacy', 'drugstore', 'ร้านขายยา', 'เภสัชกรรม',
      'medicine', 'drug', 'ยา', 'vitamin', 'supplement', 'วิตามิน',
      'lab', 'blood test', 'x-ray', 'mri', 'ct scan',
      'physical exam', 'check-up', 'ตรวจสุขภาพ',
      'ambulance', 'emergency', 'ห้องฉุกเฉิน',
      'mental health', 'therapy', 'counseling', 'psychologist',
      'gym', 'fitness', 'yoga', 'pilates', 'crossfit',
      'fitness first', 'virgin active', 'jetts', 'fit 24',
      'personal trainer', 'massage', 'spa', 'นวด',
      'insurance medical', 'health insurance', 'ประกันสุขภาพ',
    ],
  },

  // ── Entertainment ─────────────────────────────────────────────────────
  {
    category: 'Entertainment',
    patterns: [
      'movie', 'cinema', 'film', 'โรงภาพยนตร์', 'หนัง',
      'sf cinema', 'major cineplex', 'central cineplex',
      'concert', 'show', 'event', 'festival', 'งาน',
      'bowling', 'karaoke', 'คาราโอเกะ',
      'escape room', 'game', 'arcade', 'เกม',
      'theme park', 'amusement', 'aquarium', 'zoo',
      'museum', 'gallery', 'exhibition',
      'sports ticket', 'บัตรกีฬา',
      'golf', 'tennis', 'swimming', 'badminton',
      'netflix ticket', 'night out', 'club', 'pub',
      'gambling', 'lottery', 'หวย',
      'book (entertainment)', 'comic', 'manga',
    ],
  },

  // ── Pet ───────────────────────────────────────────────────────────────
  {
    category: 'Pet',
    patterns: [
      'pet', 'dog', 'cat', 'หมา', 'แมว', 'สัตว์เลี้ยง',
      'vet', 'veterinary', 'สัตวแพทย์', 'หมอสัตว์',
      'pet food', 'อาหารสัตว์', 'อาหารหมา', 'อาหารแมว',
      'pet shop', 'ร้านสัตว์เลี้ยง',
      'grooming', 'อาบน้ำสุนัข', 'อาบน้ำแมว',
      'pet hotel', 'dog hotel', 'cat hotel', 'บอร์ดดิ้ง',
      'flea', 'tick', 'vaccine pet', 'ยาพยาธิ',
      'litter', 'sandbox', 'ทรายแมว',
    ],
  },

  // ── Family ────────────────────────────────────────────────────────────
  {
    category: 'Family',
    patterns: [
      'school fee', 'tuition', 'ค่าเรียน', 'ค่าโรงเรียน',
      'nursery', 'daycare', 'ค่าเนอสเซอรี่',
      'uniform', 'ชุดนักเรียน',
      'allowance', 'เงินให้', 'โอนให้',
      'family trip', 'family dinner',
      'parent', 'parents', 'grandparent', 'พ่อแม่', 'ปู่ย่า', 'ตายาย',
      'child', 'kid', 'baby', 'ลูก', 'เด็ก', 'ทารก',
      'merit', 'temple', 'วัด', 'ทำบุญ', 'บุญ',
      'funeral', 'งานศพ', 'งานเผา',
      'wedding gift', 'งานแต่ง', 'ซอง',
    ],
  },

  // ── Housing ───────────────────────────────────────────────────────────
  {
    category: 'Housing',
    patterns: [
      'rent', 'ค่าเช่า', 'ค่าห้อง',
      'condo fee', 'ค่าส่วนกลาง', 'นิติ',
      'hoa', 'management fee',
      'mortgage', 'home loan', 'ผ่อนบ้าน',
      'repair', 'maintenance', 'ซ่อม', 'ซ่อมแซม', 'ช่าง',
      'furniture', 'เฟอร์นิเจอร์', 'โซฟา', 'เตียง', 'ตู้',
      'appliance', 'เครื่องใช้ไฟฟ้า', 'ตู้เย็น', 'เครื่องซัก',
      'cleaning', 'แม่บ้าน', 'ทำความสะอาด',
      'pest control', 'กำจัดแมลง',
      'paint', 'ทาสี', 'decor', 'ตกแต่ง',
    ],
  },

  // ── Insurance ─────────────────────────────────────────────────────────
  {
    category: 'Insurance',
    patterns: [
      'insurance', 'ประกัน',
      'life insurance', 'ประกันชีวิต',
      'car insurance', 'ประกันรถ',
      'health insurance', 'ประกันสุขภาพ',
      'home insurance', 'ประกันบ้าน',
      'travel insurance', 'ประกันการเดินทาง',
      'premium', 'เบี้ยประกัน',
      'aia', 'axa', 'allianz', 'krungthai axa', 'muang thai life',
      'sea life', 'generali', 'fwd',
    ],
  },

  // ── Travel ────────────────────────────────────────────────────────────
  {
    category: 'Travel',
    patterns: [
      'hotel', 'resort', 'hostel', 'airbnb', 'booking', 'agoda',
      'โรงแรม', 'ที่พัก', 'รีสอร์ท',
      'flight ticket', 'airline ticket',
      'tour', 'package', 'ทัวร์',
      'passport', 'visa', 'passport fee',
      'travel expense', 'trip', 'vacation', 'holiday',
      'luggage', 'กระเป๋าเดินทาง',
      'exchange', 'แลกเงิน', 'currency',
    ],
  },

  // ── Work / Professional ───────────────────────────────────────────────
  {
    category: 'Work',
    patterns: [
      'office supply', 'เครื่องเขียน', 'อุปกรณ์สำนักงาน',
      'software license', 'saas', 'tool subscription',
      'coworking', 'co-working',
      'business meal', 'client dinner', 'client lunch',
      'conference', 'seminar', 'training', 'course', 'คอร์ส',
      'professional fee', 'consultant',
      'domain', 'hosting', 'server', 'vps', 'cloud',
    ],
  },
];

// ── Categorise function ────────────────────────────────────────────────────
function categorize(text: string): { category: string; confidence: 'high' | 'low' } {
  const lower = text.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => lower.includes(p))) {
      return { category: rule.category, confidence: 'high' };
    }
  }
  return { category: 'Other', confidence: 'low' };
}

// ── Route ─────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text') || '';
  if (!text) {
    return NextResponse.json(
      { error: 'text query parameter is required' },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { input: text, ...categorize(text) },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text) {
    return NextResponse.json({ error: 'text field is required' }, { status: 400 });
  }
  return NextResponse.json(
    { input: text, ...categorize(text) },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
  );
}
