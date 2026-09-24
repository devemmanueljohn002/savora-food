import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { hashPassword } from "../src/server/auth/password";

loadEnv({ path: ".env.local" });

const IMAGES = {
  hero: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85",
  food: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
  biryani: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80",
  grilled: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=1200&q=80",
  suya: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
  asun: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
  cake: "https://images.unsplash.com/photo-1559620192-032c4bc4674e?auto=format&fit=crop&w=1200&q=80",
  birthdayCake: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
  redVelvet: "https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1200&q=80",
  smallChops: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=80",
  meatPie: "https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1200&q=80",
  puffPuff: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=80",
  zobo: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=1200&q=80",
};

type VendorSeed = {
  key: string;
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string;
  description: string;
  city: string;
  state: string;
  address: string;
  category: string;
  rating: number;
  ratingCount: number;
  isFeatured: boolean;
  image: string;
};

const VENDORS: VendorSeed[] = [
  {
    key: "mama-tolus",
    businessName: "Mama Tolu's Kitchen",
    slug: "mama-tolus-kitchen",
    ownerName: "Tolulope Adebayo",
    email: "vendor.mamatolu@demo.savora.test",
    phone: "08012340001",
    description: "Home-style Nigerian classics — smoky jollof, rich soups and the best pounded yam in Lekki.",
    city: "Lagos",
    state: "Lagos",
    address: "Lekki Phase 1, Lagos",
    category: "Food",
    rating: 4.8,
    ratingCount: 132,
    isFeatured: true,
    image: IMAGES.food,
  },
  {
    key: "sweet-crumbs",
    businessName: "Sweet Crumbs Bakery",
    slug: "sweet-crumbs-bakery",
    ownerName: "Funke Okafor",
    email: "vendor.sweetcrumbs@demo.savora.test",
    phone: "08012340002",
    description: "Custom cakes for every celebration — birthdays, weddings and corporate events.",
    city: "Abuja",
    state: "FCT",
    address: "Wuse 2, Abuja",
    category: "Cakes",
    rating: 4.9,
    ratingCount: 214,
    isFeatured: true,
    image: IMAGES.cake,
  },
  {
    key: "chops-republic",
    businessName: "Chops Republic",
    slug: "chops-republic",
    ownerName: "Ibrahim Musa",
    email: "vendor.chopsrepublic@demo.savora.test",
    phone: "08012340003",
    description: "Small chops done right — puff puff, samosa, spring rolls and grilled bites.",
    city: "Lagos",
    state: "Lagos",
    address: "GRA Ikeja, Lagos",
    category: "Snacks",
    rating: 4.7,
    ratingCount: 98,
    isFeatured: true,
    image: IMAGES.smallChops,
  },
  {
    key: "zobo-lab",
    businessName: "Zobo Lab",
    slug: "zobo-lab",
    ownerName: "Chioma Eze",
    email: "vendor.zobolab@demo.savora.test",
    phone: "08012340004",
    description: "Cold-pressed natural drinks — zobo, chapman and kunu made fresh daily.",
    city: "Ibadan",
    state: "Oyo",
    address: "Ring Road, Ibadan",
    category: "Drinks",
    rating: 4.6,
    ratingCount: 76,
    isFeatured: true,
    image: IMAGES.zobo,
  },
  {
    key: "royal-plates",
    businessName: "Royal Plates Catering",
    slug: "royal-plates-catering",
    ownerName: "Adaeze Nwosu",
    email: "vendor.royalplates@demo.savora.test",
    phone: "08012340005",
    description: "Premium event catering — weddings, corporate events and private parties.",
    city: "Lagos",
    state: "Lagos",
    address: "Victoria Island, Lagos",
    category: "Catering",
    rating: 4.9,
    ratingCount: 167,
    isFeatured: true,
    image: IMAGES.hero,
  },
  {
    key: "suya-spot",
    businessName: "The Suya Spot",
    slug: "the-suya-spot",
    ownerName: "Bello Kachalla",
    email: "vendor.suyaspot@demo.savora.test",
    phone: "08012340006",
    description: "Charcoal-grilled suya & sides with the signature yaji spice blend.",
    city: "Port Harcourt",
    state: "Rivers",
    address: "Trans Amadi, Port Harcourt",
    category: "Food",
    rating: 4.5,
    ratingCount: 61,
    isFeatured: false,
    image: IMAGES.suya,
  },
];

type ProductSeed = {
  vendorKey: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  category: string;
  productType: "FOOD" | "CAKE" | "SNACK" | "DRINK";
  image: string;
  ingredients: string[];
  rating: number;
  ratingCount: number;
  inStock: number;
  isFeatured: boolean;
};

const PRODUCTS: ProductSeed[] = [
  {
    vendorKey: "mama-tolus",
    name: "Jollof Rice & Grilled Chicken",
    slug: "jollof-rice-grilled-chicken",
    description: "Smoky party jollof rice served with flame-grilled chicken and fried plantain. Cooked in small batches and delivered hot.",
    shortDescription: "Smoky party jollof with grilled chicken & plantain.",
    price: 4500,
    compareAtPrice: 5200,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.food,
    ingredients: ["Jollof rice", "Grilled chicken", "Fried plantain", "Pepper sauce"],
    rating: 4.8,
    ratingCount: 210,
    inStock: 40,
    isFeatured: true,
  },
  {
    vendorKey: "mama-tolus",
    name: "Efo Riro & Pounded Yam",
    slug: "efo-riro-pounded-yam",
    description: "Rich vegetable stew with assorted meat and smooth, hand-pounded yam.",
    shortDescription: "Rich vegetable stew with assorted meat.",
    price: 5200,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.biryani,
    ingredients: ["Efo riro", "Assorted meat", "Pounded yam", "Palm oil"],
    rating: 4.7,
    ratingCount: 154,
    inStock: 25,
    isFeatured: false,
  },
  {
    vendorKey: "mama-tolus",
    name: "Ofada Rice & Ayamase",
    slug: "ofada-rice-ayamase",
    description: "Local ofada rice with fiery green pepper (ayamase) stew and boiled egg.",
    shortDescription: "Local ofada rice with green pepper stew.",
    price: 4800,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.grilled,
    ingredients: ["Ofada rice", "Ayamase sauce", "Boiled egg", "Assorted meat"],
    rating: 4.6,
    ratingCount: 121,
    inStock: 30,
    isFeatured: false,
  },
  {
    vendorKey: "suya-spot",
    name: "Beef Suya Platter",
    slug: "beef-suya-platter",
    description: "Charcoal-grilled suya with onions, tomatoes and a generous dusting of yaji.",
    shortDescription: "Charcoal-grilled suya with yaji spice.",
    price: 6000,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.suya,
    ingredients: ["Beef", "Yaji spice", "Onions", "Tomatoes"],
    rating: 4.7,
    ratingCount: 88,
    inStock: 20,
    isFeatured: true,
  },
  {
    vendorKey: "suya-spot",
    name: "Peppered Asun",
    slug: "peppered-asun",
    description: "Smoky grilled goat meat tossed in a spicy pepper sauce with onions.",
    shortDescription: "Spicy grilled goat meat with pepper sauce.",
    price: 8000,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.asun,
    ingredients: ["Goat meat", "Pepper sauce", "Onions"],
    rating: 4.6,
    ratingCount: 57,
    inStock: 15,
    isFeatured: false,
  },
  {
    vendorKey: "suya-spot",
    name: "Fried Rice & Turkey",
    slug: "fried-rice-turkey",
    description: "Nigerian fried rice with vegetables, liver and a grilled turkey thigh.",
    shortDescription: "Nigerian fried rice with grilled turkey.",
    price: 5000,
    category: "Food",
    productType: "FOOD",
    image: IMAGES.food,
    ingredients: ["Fried rice", "Grilled turkey", "Vegetables"],
    rating: 4.5,
    ratingCount: 43,
    inStock: 22,
    isFeatured: false,
  },
  {
    vendorKey: "sweet-crumbs",
    name: "Classic Birthday Cake",
    slug: "classic-birthday-cake",
    description: "Soft vanilla sponge finished with buttercream and a personalized message.",
    shortDescription: "Vanilla sponge with buttercream.",
    price: 32000,
    category: "Cakes",
    productType: "CAKE",
    image: IMAGES.birthdayCake,
    ingredients: ["Vanilla sponge", "Buttercream", "Custom message"],
    rating: 4.9,
    ratingCount: 178,
    inStock: 5,
    isFeatured: true,
  },
  {
    vendorKey: "sweet-crumbs",
    name: "Three-Tier Wedding Cake",
    slug: "three-tier-wedding-cake",
    description: "Elegant tiered cake with fresh floral detail and a custom finish.",
    shortDescription: "Elegant tiered cake for weddings.",
    price: 185000,
    category: "Cakes",
    productType: "CAKE",
    image: IMAGES.cake,
    ingredients: ["Vanilla/red velvet layers", "Fondant", "Fresh flowers"],
    rating: 5.0,
    ratingCount: 64,
    inStock: 2,
    isFeatured: false,
  },
  {
    vendorKey: "sweet-crumbs",
    name: "Red Velvet Celebration Cake",
    slug: "red-velvet-celebration-cake",
    description: "Moist red velvet layers with cream cheese frosting and a crunchy finish.",
    shortDescription: "Moist red velvet with cream cheese.",
    price: 42000,
    category: "Cakes",
    productType: "CAKE",
    image: IMAGES.redVelvet,
    ingredients: ["Red velvet sponge", "Cream cheese frosting"],
    rating: 4.8,
    ratingCount: 92,
    inStock: 4,
    isFeatured: false,
  },
  {
    vendorKey: "chops-republic",
    name: "Party Small Chops Tray",
    slug: "party-small-chops-tray",
    description: "Puff puff, samosa, spring rolls and grilled bites — perfect for parties.",
    shortDescription: "Assorted party small chops platter.",
    price: 12000,
    category: "Snacks",
    productType: "SNACK",
    image: IMAGES.smallChops,
    ingredients: ["Puff puff", "Samosa", "Spring rolls", "Grilled bites"],
    rating: 4.8,
    ratingCount: 140,
    inStock: 18,
    isFeatured: true,
  },
  {
    vendorKey: "chops-republic",
    name: "Meat Pie Pack",
    slug: "meat-pie-pack",
    description: "Flaky homemade meat pies with a rich savoury filling. Pack of 4.",
    shortDescription: "Flaky homemade meat pies.",
    price: 4500,
    category: "Snacks",
    productType: "SNACK",
    image: IMAGES.meatPie,
    ingredients: ["Flour", "Minced meat", "Butter", "Onion"],
    rating: 4.6,
    ratingCount: 73,
    inStock: 30,
    isFeatured: false,
  },
  {
    vendorKey: "chops-republic",
    name: "Puff Puff (20 pieces)",
    slug: "puff-puff-20-pieces",
    description: "Soft golden puff puff, fried fresh to order.",
    shortDescription: "Soft golden puff puff, fried fresh.",
    price: 3000,
    category: "Snacks",
    productType: "SNACK",
    image: IMAGES.puffPuff,
    ingredients: ["Flour", "Sugar", "Yeast", "Nutmeg"],
    rating: 4.7,
    ratingCount: 66,
    inStock: 50,
    isFeatured: false,
  },
  {
    vendorKey: "zobo-lab",
    name: "Chilled Zobo Punch",
    slug: "chilled-zobo-punch",
    description: "Hibiscus zobo lightly sweetened with pineapple and ginger. 500ml bottle.",
    shortDescription: "Hibiscus zobo with pineapple & ginger.",
    price: 1500,
    category: "Drinks",
    productType: "DRINK",
    image: IMAGES.zobo,
    ingredients: ["Hibiscus", "Pineapple", "Ginger", "Honey"],
    rating: 4.7,
    ratingCount: 84,
    inStock: 100,
    isFeatured: true,
  },
  {
    vendorKey: "zobo-lab",
    name: "Chapman Classic",
    slug: "chapman-classic",
    description: "The classic Nigerian cocktail — bitters, cucumber, lime and grenadine.",
    shortDescription: "Classic Nigerian Chapman cocktail.",
    price: 1200,
    category: "Drinks",
    productType: "DRINK",
    image: IMAGES.zobo,
    ingredients: ["Bitters", "Cucumber", "Lime", "Grenadine"],
    rating: 4.5,
    ratingCount: 51,
    inStock: 80,
    isFeatured: false,
  },
  {
    vendorKey: "zobo-lab",
    name: "Kunu Aya (Tiger Nut)",
    slug: "kunu-aya-tiger-nut",
    description: "Creamy tiger nut drink with dates and a hint of coconut.",
    shortDescription: "Creamy tiger nut drink.",
    price: 1200,
    category: "Drinks",
    productType: "DRINK",
    image: IMAGES.zobo,
    ingredients: ["Tiger nuts", "Dates", "Coconut", "Ginger"],
    rating: 4.6,
    ratingCount: 39,
    inStock: 60,
    isFeatured: false,
  },
] as const;

const CATEGORIES = [
  { name: "Food", slug: "food", type: "FOOD" },
  { name: "Cakes", slug: "cakes", type: "CAKE" },
  { name: "Snacks", slug: "snacks", type: "SNACK" },
  { name: "Drinks", slug: "drinks", type: "DRINK" },
  { name: "Catering", slug: "catering", type: "CATERING" },
];

const LOCATIONS = [
  { name: "Lekki", state: "Lagos", city: "Lagos", fee: 900, minutes: 45 },
  { name: "Ikeja", state: "Lagos", city: "Lagos", fee: 800, minutes: 40 },
  { name: "Victoria Island", state: "Lagos", city: "Lagos", fee: 850, minutes: 40 },
  { name: "Wuse 2", state: "FCT", city: "Abuja", fee: 900, minutes: 45 },
  { name: "Garki", state: "FCT", city: "Abuja", fee: 800, minutes: 35 },
  { name: "Ring Road", state: "Oyo", city: "Ibadan", fee: 700, minutes: 50 },
  { name: "Bodija", state: "Oyo", city: "Ibadan", fee: 700, minutes: 50 },
  { name: "Trans Amadi", state: "Rivers", city: "Port Harcourt", fee: 800, minutes: 50 },
  { name: "GRA Phase 2", state: "Rivers", city: "Port Harcourt", fee: 800, minutes: 45 },
];

const CATERING_PACKAGES = [
  {
    vendorKey: "royal-plates",
    title: "Royal Wedding Buffet",
    slug: "royal-wedding-buffet",
    description: "A full wedding spread with live stations, servers and complete setup end-to-end.",
    pricePerGuest: 12500,
    minimumGuests: 100,
    includedServices: ["3 rice options", "2 soups & swallows", "Drinks & dessert", "Professional service staff", "Full setup & cleanup"],
    eventTypes: ["Wedding", "Reception", "Engagement"],
  },
  {
    vendorKey: "royal-plates",
    title: "Corporate Lunch Service",
    slug: "corporate-lunch-service",
    description: "Individually packaged lunches delivered on schedule for meetings and conferences.",
    pricePerGuest: 7500,
    minimumGuests: 25,
    includedServices: ["Packaged lunches", "On-schedule delivery", "Branded packaging option", "Dietary options"],
    eventTypes: ["Corporate Event", "Conference", "Board Meeting"],
  },
  {
    vendorKey: "royal-plates",
    title: "Birthday Party Pack",
    slug: "birthday-party-pack",
    description: "Everything a house party needs, delivered hot with friendly service.",
    pricePerGuest: 5500,
    minimumGuests: 30,
    includedServices: ["Main dish options", "Small chops", "Drinks", "Event cake add-on"],
    eventTypes: ["Birthday", "Private Event", "Home Party"],
  },
  {
    vendorKey: "royal-plates",
    title: "Home-Style Event Trays",
    slug: "home-style-event-trays",
    description: "Traditional Nigerian dishes prepared in large trays for easy gatherings.",
    pricePerGuest: 6200,
    minimumGuests: 40,
    includedServices: ["Large sharing trays", "Nigerian classics", "Delivery included"],
    eventTypes: ["Private Event", "Religious Event", "Funeral"],
  },
];

function sqlArray(value: string[]): string {
  // postgres.js maps JS arrays to native arrays; jsonb columns need a cast.
  return value.length ? JSON.stringify(value) : "[]";
}

const PRODUCT_BY_SLUG = Object.fromEntries(PRODUCTS.map((p) => [p.slug, p]));

type DemoOrderSpec = {
  number: string;
  vendorSlug: string;
  daysAgo: number;
  items: Array<{ slug: string; qty: number }>;
  reviews: Array<{ slug: string; rating: number; comment: string }>;
};

const DEMO_ORDERS: DemoOrderSpec[] = [
  {
    number: "SV-DEMO-1001",
    vendorSlug: "mama-tolus-kitchen",
    daysAgo: 12,
    items: [{ slug: "jollof-rice-grilled-chicken", qty: 2 }, { slug: "efo-riro-pounded-yam", qty: 1 }],
    reviews: [
      { slug: "jollof-rice-grilled-chicken", rating: 5, comment: "The jollof tasted like proper party jollof — smoky and rich. Delivery was on time and everything was hot." },
      { slug: "efo-riro-pounded-yam", rating: 4, comment: "Solid efo riro with generous assorted meat. Pounded yam was smooth. Would order again." },
    ],
  },
  {
    number: "SV-DEMO-1002",
    vendorSlug: "mama-tolus-kitchen",
    daysAgo: 8,
    items: [{ slug: "ofada-rice-ayamase", qty: 1 }, { slug: "fried-rice-turkey", qty: 1 }],
    reviews: [
      { slug: "ofada-rice-ayamase", rating: 5, comment: "Ayamase was everything. Spicy, deep flavor, and the ofada rice was properly cooked." },
      { slug: "fried-rice-turkey", rating: 4, comment: "Tasty fried rice with juicy turkey. Portion was fair for the price." },
    ],
  },
  {
    number: "SV-DEMO-1003",
    vendorSlug: "sweet-crumbs-bakery",
    daysAgo: 5,
    items: [{ slug: "classic-birthday-cake", qty: 1 }, { slug: "red-velvet-celebration-cake", qty: 1 }],
    reviews: [
      { slug: "classic-birthday-cake", rating: 5, comment: "Beautiful buttercream finish and the cake was moist. Everyone at the party asked where it was from." },
      { slug: "red-velvet-celebration-cake", rating: 5, comment: "Perfect red velvet — cream cheese frosting was on point. Arrived exactly as pictured." },
    ],
  },
  {
    number: "SV-DEMO-1004",
    vendorSlug: "chops-republic",
    daysAgo: 3,
    items: [{ slug: "party-small-chops-tray", qty: 1 }, { slug: "puff-puff-20-pieces", qty: 2 }, { slug: "meat-pie-pack", qty: 1 }],
    reviews: [
      { slug: "party-small-chops-tray", rating: 4, comment: "Great selection for a small gathering. Samosas and spring rolls were crisp." },
      { slug: "puff-puff-20-pieces", rating: 5, comment: "Soft, fluffy, and fried to perfection. My kids crushed the whole box." },
      { slug: "meat-pie-pack", rating: 4, comment: "Flaky crust, generous filling. Definitely among the better meat pies I've had." },
    ],
  },
  {
    number: "SV-DEMO-1005",
    vendorSlug: "the-suya-spot",
    daysAgo: 2,
    items: [{ slug: "beef-suya-platter", qty: 3 }],
    reviews: [{ slug: "beef-suya-platter", rating: 5, comment: "Chargrilled, well-peppered and juicy. The yaji is the real deal. Order came hot." }],
  },
  {
    number: "SV-DEMO-1006",
    vendorSlug: "zobo-lab",
    daysAgo: 1,
    items: [{ slug: "chilled-zobo-punch", qty: 4 }, { slug: "chapman-classic", qty: 2 }],
    reviews: [
      { slug: "chilled-zobo-punch", rating: 5, comment: "Fresh zobo with just the right sweetness. Cold on arrival — perfect for hot afternoons." },
      { slug: "chapman-classic", rating: 4, comment: "Proper homemade chapman, nicely balanced. A little sweet for me but very refreshing." },
    ],
  },
];

async function seedDemoOrdersAndReviews(
  sql: ReturnType<typeof postgres>,
  customerId: string | undefined,
): Promise<void> {
  if (!customerId) {
    console.log("  (skipped: no demo customer in this run)");
    return;
  }

  await sql`
    INSERT INTO addresses (user_id, label, recipient_name, phone, full_address, city, state, is_default)
    SELECT ${customerId}, 'Home', 'Ada Customer', '08012340000', '12 Admiralty Way', 'Lekki', 'Lagos', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM addresses a WHERE a.user_id = ${customerId} AND a.label = 'Home')
  `;
  const address = await sql<{ id: string }[]>`SELECT id FROM addresses WHERE user_id = ${customerId} AND label = 'Home' LIMIT 1`;

  const allSlugs = [
    ...new Set(DEMO_ORDERS.flatMap((order) => [...order.items.map((item) => item.slug), ...order.reviews.map((review) => review.slug)])),
  ];
  const productRows = await sql<{ id: string; slug: string; vendor_id: string }[]>`
    SELECT p.id, p.slug, p.vendor_id
    FROM products p
    WHERE p.slug = ANY(${allSlugs})
  `;
  const productById = new Map(productRows.map((row) => [row.slug, row]));

  for (const order of DEMO_ORDERS) {
    const existing = await sql`SELECT 1 FROM orders WHERE order_number = ${order.number}`;
    if (existing.length > 0) {
      console.log(`  - ${order.number} (already exists)`);
      continue;
    }

    const first = productById.get(order.items[0].slug);
    if (!first) {
      console.log(`  - ${order.number} (missing product for ${order.items[0].slug})`);
      continue;
    }

    const subtotal = order.items.reduce((sum, item) => sum + (PRODUCT_BY_SLUG[item.slug]?.price ?? 0) * item.qty, 0);

    const orderRows = await sql<{ id: string }[]>`
      INSERT INTO orders (
        order_number, user_id, vendor_id, address_id, status, currency,
        subtotal, delivery_fee, discount, total, payment_provider, payment_status,
        created_at, updated_at
      )
      VALUES (
        ${order.number}, ${customerId}, ${first.vendor_id}, ${address[0]?.id ?? null},
        'DELIVERED', 'NGN', ${subtotal}, 0, 0, ${subtotal}, 'PAYSTACK', 'PAID',
        NOW() - make_interval(days => ${order.daysAgo}), NOW() - make_interval(days => ${order.daysAgo})
      )
      RETURNING id
    `;
    const orderId = orderRows[0].id;

    for (const item of order.items) {
      const product = PRODUCT_BY_SLUG[item.slug];
      if (!product) continue;
      await sql`
        INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total)
        VALUES (${orderId}, ${productById.get(item.slug)?.id ?? null}, ${product.name}, ${product.price}, ${item.qty}, ${product.price * item.qty})
      `;
    }

    await sql`
      INSERT INTO order_status_history (order_id, status, note, created_at)
      VALUES
        (${orderId}, 'CONFIRMED', 'Order accepted by vendor', NOW() - make_interval(days => ${order.daysAgo - 1})),
        (${orderId}, 'OUT_FOR_DELIVERY', 'Rider on the way', NOW() - make_interval(hours => 5)),
        (${orderId}, 'DELIVERED', 'Delivered to customer', NOW() - make_interval(days => ${order.daysAgo}))
    `;

    await sql`
      INSERT INTO payments (order_id, payment_reference, provider, status, amount, currency, raw_payload, paid_at)
      VALUES (${orderId}, ${"SV-" + order.number}, 'PAYSTACK', 'SUCCESS', ${subtotal}, 'NGN', '{"seed": true}', NOW() - make_interval(days => ${order.daysAgo}))
    `;

    for (const review of order.reviews) {
      const product = productById.get(review.slug);
      if (!product) continue;
      await sql`
        INSERT INTO reviews (user_id, order_id, product_id, vendor_id, rating, comment, is_approved)
        VALUES (${customerId}, ${orderId}, ${product.id}, ${product.vendor_id}, ${review.rating}, ${review.comment}, TRUE)
      `;
    }

    console.log(`  + ${order.number} (${order.reviews.length} reviews)`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 5, ssl: "require", onnotice: () => {} });

  try {
    const demoPassword = "Demo_User_123!";

    console.log("Creating demo users…");

    // Admin
    const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@savora.food";
    const adminPassword = process.env.ADMIN_SEED_PASSWORD || "ChangeMe_Admin_123!";
    await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES (${adminEmail}, ${await hashPassword(adminPassword)}, 'Savora', 'Admin', 'ADMIN', 'ACTIVE', NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `;

    // Super admin (fullest access)
    const superAdminEmail = process.env.SUPER_ADMIN_SEED_EMAIL || "superadmin@savora.food";
    const superAdminPassword = process.env.SUPER_ADMIN_SEED_PASSWORD || "ChangeMe_Super_123!";
    if (await sql`SELECT 1 FROM roles WHERE name = 'SUPER_ADMIN'`) {
      await sql`
        INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
        VALUES (${superAdminEmail}, ${await hashPassword(superAdminPassword)}, 'Savora', 'Super Admin', 'SUPER_ADMIN', 'ACTIVE', NOW())
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      `;
    } else {
      console.log("  (skipped SUPER_ADMIN: run `npm run db:migrate` first)");
    }

    // Delivery partner (rider)
    const riderEmail = process.env.RIDER_SEED_EMAIL || "rider@savorafoods.com";
    const riderPassword = process.env.RIDER_SEED_PASSWORD || "Demo_User_123!";
    const rider = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES (${riderEmail}, ${await hashPassword(riderPassword)}, 'Emeka', 'Rider', 'DELIVERY_PARTNER', 'ACTIVE', NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `;
    let riderId = rider[0]?.id;
    if (!riderId) {
      const fetched = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${riderEmail} LIMIT 1
      `;
      riderId = fetched[0]?.id;
    }
    if (riderId) {
      await sql`
        INSERT INTO delivery_partners (user_id, name, phone, vehicle_type, vehicle_number, status, verification_status, verified_at, rating_average, rating_count)
        VALUES (${riderId}, 'Emeka Rider', '08012340009', 'Motorcycle', 'KJA-123-XY', 'ACTIVE', 'APPROVED', NOW(), 4.8, 120)
        ON CONFLICT (user_id) DO NOTHING
      `;
      const partner = await sql<{ id: string }[]>`SELECT id FROM delivery_partners WHERE user_id = ${riderId} LIMIT 1`;
      if (partner[0]) {
        await sql`
          INSERT INTO rider_documents (delivery_partner_id, kind, url, status, reviewed_at)
          SELECT ${partner[0].id}, 'DRIVERS_LICENSE', 'https://placehold.co/400x240?text=Drivers+License', 'APPROVED', NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM rider_documents rd WHERE rd.delivery_partner_id = ${partner[0].id} AND rd.kind = 'DRIVERS_LICENSE'
          )
        `;
      }
    }

    // Demo customer
    const customer = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES ('customer@savorafoods.com', ${await hashPassword(demoPassword)}, 'Ada', 'Customer', 'CUSTOMER', 'ACTIVE', NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `;
    let customerId = customer[0]?.id;
    if (!customerId) {
      const fetched = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = 'customer@savorafoods.com' LIMIT 1
      `;
      customerId = fetched[0]?.id;
    }

    // Vendor owner accounts
    const vendorUsers: Record<string, { id: string; passwordHash: string }> = {};
    for (const vendor of VENDORS) {
      const passwordHash = await hashPassword(demoPassword);
      const rows = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
        VALUES (${vendor.email}, ${passwordHash}, ${vendor.ownerName.split(" ")[0]}, ${vendor.ownerName.split(" ").slice(1).join(" ")}, 'VENDOR', 'ACTIVE', NOW())
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id
      `;
      const row = rows[0];
      if (row) vendorUsers[vendor.key] = { id: row.id, passwordHash };
    }

    console.log("Seeding categories…");
    const categoryIds: Record<string, string> = {};
    for (const category of CATEGORIES) {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO categories (name, slug, is_active, sort_order)
        VALUES (${category.name}, ${category.slug}, TRUE, 0)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `;
      const row = rows[0] ?? (await sql<{ id: string }[]>`SELECT id FROM categories WHERE slug = ${category.slug} LIMIT 1`)[0];
      if (row) categoryIds[category.name] = row.id;
    }

    console.log("Seeding locations…");
    for (const location of LOCATIONS) {
      await sql`
        INSERT INTO locations (name, state, city, is_active, delivery_fee, delivery_time_minutes)
        VALUES (${location.name}, ${location.state}, ${location.city}, TRUE, ${location.fee}, ${location.minutes})
        ON CONFLICT DO NOTHING
      `;
    }

    console.log("Seeding vendors…");
    const vendorIds: Record<string, string> = {};
    for (const vendor of VENDORS) {
      const owner = vendorUsers[vendor.key];
      if (!owner) continue;

      const rows = await sql<{ id: string }[]>`
        INSERT INTO vendors (
          user_id, business_name, slug, owner_name, phone, email, description,
          address, city, state, logo_url, banner_image_url,
          status, rating_average, rating_count, is_featured
        )
        VALUES (
          ${owner.id}, ${vendor.businessName}, ${vendor.slug}, ${vendor.ownerName}, ${vendor.phone}, ${vendor.email}, ${vendor.description},
          ${vendor.address}, ${vendor.city}, ${vendor.state}, ${vendor.image}, ${vendor.image},
          'APPROVED', ${vendor.rating}, ${vendor.ratingCount}, ${vendor.isFeatured}
        )
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `;
      const row = rows[0] ?? (await sql<{ id: string }[]>`SELECT id FROM vendors WHERE slug = ${vendor.slug} LIMIT 1`)[0];
      if (row) {
        vendorIds[vendor.key] = row.id;

        const categoryId = categoryIds[vendor.category];
        if (categoryId) {
          await sql`
            INSERT INTO vendor_categories (vendor_id, category_id)
            VALUES (${row.id}, ${categoryId})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    console.log("Seeding a pending vendor (for admin review)…");
    const pendingVendorPasswordHash = await hashPassword(demoPassword);
    const pendingOwner = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES ('vendor.freshbites@demo.savora.test', ${pendingVendorPasswordHash}, 'Ngozi', 'Umeh', 'VENDOR', 'ACTIVE', NOW())
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `;
    const pendingOwnerId = pendingOwner[0]?.id ?? (await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'vendor.freshbites@demo.savora.test' LIMIT 1`)[0]?.id;
    if (pendingOwnerId) {
      await sql`
        INSERT INTO vendors (
          user_id, business_name, slug, owner_name, phone, email, description, address,
          city, state, logo_url, banner_image_url, status, rating_average, rating_count, is_featured, commission_rate
        )
        VALUES (
          ${pendingOwnerId}, ${'Fresh Bites Kitchen'}, 'fresh-bites-kitchen', 'Ngozi Umeh', '08012340010', 'vendor.freshbites@demo.savora.test',
          'Modern kitchen serving bowls, grilled plates and fresh juices.', 'Bodija, Ibadan', 'Ibadan', 'Oyo', ${IMAGES.food}, ${IMAGES.food},
          'PENDING', 0, 0, FALSE, 10.00
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    }

    console.log("Seeding products…");
    for (const product of PRODUCTS) {
      const vendorId = vendorIds[product.vendorKey];
      const categoryId = categoryIds[product.category];
      if (!vendorId || !categoryId) continue;

      const rows = await sql<{ id: string }[]>`
        INSERT INTO products (
          vendor_id, category_id, name, slug, description, short_description,
          price, compare_at_price, image_url, ingredients, availability,
          stock_quantity, rating_average, rating_count, is_featured, is_active, product_type
        )
        VALUES (
          ${vendorId}, ${categoryId}, ${product.name}, ${product.slug}, ${product.description}, ${product.shortDescription},
          ${product.price}, ${product.compareAtPrice?.toFixed(2) ?? null}, ${product.image},
          ${sqlArray([...product.ingredients])}::jsonb, TRUE,
          ${product.inStock}, ${product.rating}, ${product.ratingCount}, ${product.isFeatured}, TRUE, ${product.productType}
        )
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `;
      const row = rows[0];
      if (row) {
        await sql`
          INSERT INTO product_images (product_id, url, is_primary, sort_order)
          VALUES (${row.id}, ${product.image}, TRUE, 0)
          ON CONFLICT DO NOTHING
        `;
      }
    }

    console.log("Seeding catering packages…");
    for (const pkg of CATERING_PACKAGES) {
      const vendorId = vendorIds[pkg.vendorKey];
      if (!vendorId) continue;

      await sql`
        INSERT INTO catering_packages (
          vendor_id, title, slug, description, price_per_guest, minimum_guests,
          included_services, event_types, is_active
        )
        VALUES (
          ${vendorId}, ${pkg.title}, ${pkg.slug}, ${pkg.description}, ${pkg.pricePerGuest}, ${pkg.minimumGuests},
          ${sqlArray(pkg.includedServices)}::jsonb, ${sqlArray(pkg.eventTypes)}::jsonb, TRUE
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    }

    console.log("Seeding demo orders + reviews…");
    await seedDemoOrdersAndReviews(sql, customerId);

    console.log("Seeding product variants…");
    const variantTargets: Array<{ slug: string; variants: Array<[string, number, number]> }> = [
      { slug: "jollof-rice-grilled-chicken", variants: [["Regular", 4500, 40], ["Large", 6500, 30]] },
      { slug: "party-small-chops-tray", variants: [["Small Tray", 12000, 18], ["Large Tray", 24000, 10]] },
      { slug: "chilled-zobo-punch", variants: [["500ml", 1500, 100], ["1 Litre", 2500, 60]] },
    ];
    for (const target of variantTargets) {
      const product = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${target.slug} LIMIT 1`;
      if (!product[0]) continue;
      for (const [name, price, stock] of target.variants) {
        await sql`
          INSERT INTO product_variants (product_id, name, price, stock_quantity, is_active)
          VALUES (${product[0].id}, ${name}, ${price}, ${stock}, TRUE)
          ON CONFLICT DO NOTHING
        `;
      }
    }

    console.log("Seeding coupons & payouts…");
    await sql`
      INSERT INTO coupons (code, type, value, max_uses, is_active) VALUES ('WELCOME10', 'PERCENT', 10.00, 500, TRUE)
      ON CONFLICT (code) DO NOTHING
    `;
    await sql`
      INSERT INTO coupons (code, type, value, max_uses, is_active) VALUES ('SAVE1500', 'FIXED', 1500, 200, TRUE)
      ON CONFLICT (code) DO NOTHING
    `;
    if (vendorIds["royal-plates"]) {
      await sql`
        INSERT INTO coupons (code, type, value, max_uses, is_active, vendor_id)
        VALUES ('ROYAL5', 'PERCENT', 5.00, 100, TRUE, ${vendorIds["royal-plates"]})
        ON CONFLICT (code) DO NOTHING
      `;
    }
    if (vendorIds["mama-tolus"]) {
      await sql`
        INSERT INTO vendor_payouts (vendor_id, reference, period_start, period_end, gross_amount, commission_amount, fees_amount, net_amount, status, paid_at)
        VALUES (
          ${vendorIds["mama-tolus"]}, 'PAYOUT-SV-2026-08', '2026-08-01', '2026-08-31',
          485000, 48500, 0, 436500, 'PAID', '2026-09-05T10:00:00Z'
        )
        ON CONFLICT (reference) DO NOTHING
      `;
    }

    console.log("Seeding catering requests…");
    if (customerId && vendorIds["royal-plates"]) {
      const packageRow = await sql<{ id: string }[]>`
        SELECT id FROM catering_packages WHERE slug = 'royal-wedding-buffet' LIMIT 1
      `;
      if (packageRow[0]) {
        // Booked request with an accepted quote.
        const booked = await sql<{ id: string }[]>`
          INSERT INTO catering_requests (
            package_id, user_id, vendor_id, full_name, phone, email, event_type,
            event_date, event_location, guest_count, special_requirements, status
          )
          SELECT ${packageRow[0].id}, ${customerId}, ${vendorIds["royal-plates"]},
            'Ada Customer', '08012340000', 'customer@savorafoods.com', 'Wedding',
            '2026-12-12'::date, 'Lagos, Nigeria', 120, 'Vegetarian options for 15 guests', 'BOOKED'
          WHERE NOT EXISTS (
            SELECT 1 FROM catering_requests cr
            WHERE cr.user_id = ${customerId}
              AND cr.vendor_id = ${vendorIds["royal-plates"]}
              AND cr.package_id = ${packageRow[0].id}
              AND cr.event_date = '2026-12-12'::date
          )
          RETURNING id
        `;
        if (booked[0]) {
          await sql`
            INSERT INTO catering_quotes (request_id, quote_amount, per_guest, message, status, responded_at)
            VALUES (${booked[0].id}, 1500000, 12500, 'Please find our quote for the Royal Wedding Buffet.', 'ACCEPTED', NOW())
            ON CONFLICT DO NOTHING
          `;
        }
        // Pending request awaiting a vendor quotation.
        await sql`
          INSERT INTO catering_requests (
            package_id, user_id, vendor_id, full_name, phone, email, event_type,
            event_date, event_location, guest_count, special_requirements, status
          )
          SELECT ${packageRow[0].id}, ${customerId}, ${vendorIds["royal-plates"]},
            'Ada Customer', '08012340000', 'customer@savorafoods.com', 'Corporate Event',
            '2026-11-20'::date, 'Victoria Island, Lagos', 60, NULL, 'SUBMITTED'
          WHERE NOT EXISTS (
            SELECT 1 FROM catering_requests cr
            WHERE cr.user_id = ${customerId}
              AND cr.vendor_id = ${vendorIds["royal-plates"]}
              AND cr.package_id = ${packageRow[0].id}
              AND cr.event_date = '2026-11-20'::date
          )
        `;
      }
    }

    console.log("Seeding notifications…");
    if (customerId) {
      await sql`
        INSERT INTO notifications (user_id, type, title, body, data)
        SELECT ${customerId}, 'ORDER', 'Your order is confirmed',
          'Mama Tolu''s Kitchen has accepted your order.', '{"kind":"demo"}'::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications n WHERE n.user_id = ${customerId} AND n.title = 'Your order is confirmed'
        )
      `;
    } else {
      console.log("  (skipped notifications: no demo customer)");
    }

    console.log("Seed complete.");
    console.log("");
    console.log("Sample accounts (password: " + demoPassword + "):");
    console.log("  customer@savorafoods.com");
    console.log("  " + riderEmail);
    for (const vendor of VENDORS) console.log("  " + vendor.email);
    console.log("  vendor.freshbites@demo.savora.test (pending approval)");
    console.log("Admin (password from .env.local): " + adminEmail);
    console.log("Super admin (password from .env.local): " + superAdminEmail);
    console.log("");
    console.log("Demo customer id:", customerId || "(missing)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});