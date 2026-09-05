export const images = {
  food: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
  cake: "https://images.unsplash.com/photo-1559620192-032c4bc4674e?auto=format&fit=crop&w=1200&q=80",
  snack: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80",
  drink: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=1200&q=80",
  catering: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85",
  hero: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85",
};

export type ProductItem = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  price: number;
  oldPrice?: number;
  rating: number;
  image: string;
  description?: string;
  location?: string;
  featured?: boolean;
};

export const food: ProductItem[] = [
  {
    id: "jollof-rice-grilled-chicken",
    name: "Jollof Rice & Grilled Chicken",
    vendor: "Mama Tolu's Kitchen",
    category: "Rice Dishes",
    price: 4500,
    oldPrice: 5200,
    rating: 4.8,
    image: images.food,
    description: "Smoky party jollof served with grilled chicken and fried plantain.",
    location: "Lekki Phase 1, Lagos",
    featured: true,
  },
  {
    id: "efo-riro-pounded-yam",
    name: "Efo Riro & Pounded Yam",
    vendor: "Mama Tolu's Kitchen",
    category: "Swallow",
    price: 5200,
    rating: 4.7,
    image: images.food,
    description: "Rich vegetable stew with assorted meat and smooth pounded yam.",
    location: "Lekki Phase 1, Lagos",
  },
  {
    id: "ofada-rice-ayamase",
    name: "Ofada Rice & Ayamase",
    vendor: "Mama Tolu's Kitchen",
    category: "Rice Dishes",
    price: 4800,
    rating: 4.6,
    image: images.food,
    description: "Local ofada rice with green pepper stew and boiled egg.",
    location: "Lekki Phase 1, Lagos",
  },
  {
    id: "beef-suya-platter",
    name: "Beef Suya Platter",
    vendor: "The Suya Spot",
    category: "Grills",
    price: 6000,
    rating: 4.7,
    image: images.food,
    description: "Charcoal-grilled suya with onions, tomatoes and yaji.",
    location: "Trans Amadi, Port Harcourt",
  },
];

export const cakes: ProductItem[] = [
  {
    id: "classic-birthday-cake",
    name: "Classic Birthday Cake",
    vendor: "Sweet Crumbs Bakery",
    category: "Birthday Cakes",
    price: 32000,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
    description: "Soft vanilla sponge finished with buttercream and personalized message.",
    location: "Wuse 2, Abuja",
  },
  {
    id: "wedding-tier-cake",
    name: "Three-Tier Wedding Cake",
    vendor: "Sweet Crumbs Bakery",
    category: "Wedding Cakes",
    price: 185000,
    rating: 5,
    image: "https://images.unsplash.com/photo-1559620192-032c4bc4674e?auto=format&fit=crop&w=1200&q=80",
    description: "Elegant tiered cake with fresh floral detail and custom finish.",
    location: "Wuse 2, Abuja",
  },
  {
    id: "red-velvet-cake",
    name: "Red Velvet Celebration Cake",
    vendor: "Sweet Crumbs Bakery",
    category: "Celebration Cakes",
    price: 42000,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1200&q=80",
    description: "Moist red velvet layers with cream cheese frosting and crunchy finish.",
    location: "Wuse 2, Abuja",
  },
];

export const snacks: ProductItem[] = [
  {
    id: "small-chops-tray",
    name: "Party Small Chops Tray",
    vendor: "Chops Republic",
    category: "Small Chops",
    price: 12000,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=80",
    description: "Puff puff, samosa, spring rolls, and grilled bites for parties.",
    location: "GRA Ikeja, Lagos",
  },
  {
    id: "meat-pie-pack",
    name: "Meat Pie Pack",
    vendor: "Chops Republic",
    category: "Meat Pie",
    price: 4500,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1200&q=80",
    description: "Flaky homemade meat pies with a rich savoury filling.",
    location: "GRA Ikeja, Lagos",
  },
  {
    id: "puff-puff-box",
    name: "Puff Puff (20 pieces)",
    vendor: "Chops Republic",
    category: "Puff Puff",
    price: 3000,
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=80",
    description: "Soft golden puff puff, fried fresh to order.",
    location: "GRA Ikeja, Lagos",
  },
];

export const vendors = [
  {
    id: "mama-tolus",
    name: "Mama Tolu's Kitchen",
    tagline: "Home-style Nigerian classics",
    category: "Food",
    city: "Lagos",
    location: "Lekki Phase 1",
    rating: 4.8,
    image: images.food,
    verified: true,
  },
  {
    id: "sweet-crumbs",
    name: "Sweet Crumbs Bakery",
    tagline: "Custom cakes for every celebration",
    category: "Cakes",
    city: "Abuja",
    location: "Wuse 2",
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1559620192-032c4bc4674e?auto=format&fit=crop&w=1200&q=80",
    verified: true,
  },
  {
    id: "royal-plates",
    name: "Royal Plates Catering",
    tagline: "Premium event catering",
    category: "Catering",
    city: "Lagos",
    location: "Victoria Island",
    rating: 4.9,
    image: images.catering,
    verified: true,
  },
  {
    id: "chops-republic",
    name: "Chops Republic",
    tagline: "Small chops done right",
    category: "Snacks",
    city: "Lagos",
    location: "GRA Ikeja",
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=80",
    verified: true,
  },
  {
    id: "zobo-lab",
    name: "Zobo Lab",
    tagline: "Cold-pressed natural drinks",
    category: "Drinks",
    city: "Ibadan",
    location: "Ring Road",
    rating: 4.6,
    image: images.drink,
    verified: true,
  },
  {
    id: "suya-spot",
    name: "The Suya Spot",
    tagline: "Charcoal-grilled suya & sides",
    category: "Food",
    city: "Port Harcourt",
    location: "Trans Amadi",
    rating: 4.5,
    image: images.food,
    verified: false,
  },
];
