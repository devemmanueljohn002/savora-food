import PageShell from "@/components/PageShell"; import ProductCard from "@/components/ProductCard"; import { food, cakes, images } from "@/lib/data";
import { getFeaturedProducts } from "@/lib/savora-api";
const cats=[["Food",images.food],["Cakes",images.cake],["Snacks",images.snack],["Drinks",images.drink],["Catering",images.catering]];
export default async function Home() {
	const featured = await getFeaturedProducts();
	const items = featured.length ? featured : [...food.slice(0, 3), ...cakes.slice(0, 3)];

	return (
		<PageShell>
			<section className="hero">
				<div className="container hero-grid">
					<div>
						<span className="pill">Now delivering in Lagos, Abuja, Ibadan & Port Harcourt</span>
						<h1>
							Your Food.<br />Your Choice.<br />
							<span className="accent">Delivered.</span>
						</h1>
						<p>
							Savora Food connects you with restaurants, bakers, snack vendors, drink brands and caterers — order securely and track every delivery.
						</p>
						<div className="row" style={{ justifyContent: "flex-start" }}>
							<input className="search" placeholder="Search jollof, cakes, small chops, vendors..." />
							<button className="btn">Find Food →</button>
						</div>
					</div>
					<img className="hero-img" src={images.food} alt="Nigerian food" />
				</div>
			</section>

			<section className="section container">
				<h2>Shop by category</h2>
				<p className="section-sub">Everything from a quick lunch to a full event spread.</p>
				<div className="category">
					{cats.map(([n, img]) => (
						<div className="card" key={n}>
							<img src={img} alt={n} />
							<div className="card-body">
								<strong>{n}</strong>
								<p className="muted">Explore Savora Food</p>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="section container">
				<h2>Featured vendors</h2>
				<p className="section-sub">Verified kitchens, bakers and caterers on Savora Food.</p>
				<div className="grid">
					{items.slice(0, 3).map((x, i) => (
						<ProductCard item={x} key={i} />
					))}
				</div>
			</section>

			<section className="section container">
				<h2>Popular right now</h2>
				<p className="section-sub">What Savora Food customers are ordering today.</p>
				<div className="grid">
					{items.map((x, i) => (
						<ProductCard item={x} key={i} />
					))}
				</div>
			</section>

			<section className="section" style={{ background: "#fff5e4" }}>
				<div className="container two-col">
					<div>
						<span className="pill">Catering Marketplace</span>
						<h2>Book trusted caterers for any event</h2>
						<p className="muted">Share your event details, receive a quote, confirm the booking and track it.</p>
						<button className="btn">Request Catering</button>
					</div>
					<div className="feature">
						{[
							"Royal Wedding Buffet",
							"Corporate Lunches",
							"Birthday Packages",
							"Bridal Shower Desserts",
						].map((n) => (
							<div className="feature-item" key={n}>{n}</div>
						))}
					</div>
				</div>
			</section>
		</PageShell>
	);
}
