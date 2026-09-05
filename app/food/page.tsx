import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { food } from "@/lib/data";
import { getProductsByType } from "@/lib/savora-api";

export default async function Page() {
	const liveItems = await getProductsByType("FOOD");

	return (
		<PageShell>
			<Marketplace
				title="Food Marketplace"
				description="Hot, freshly cooked meals from restaurants and home kitchens across Nigeria."
				items={liveItems.length ? liveItems : food}
			/>
		</PageShell>
	);
}
