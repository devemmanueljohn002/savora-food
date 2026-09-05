import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { cakes } from "@/lib/data";
import { getProductsByType } from "@/lib/savora-api";

export default async function Page() {
	const liveItems = await getProductsByType("CAKE");

	return (
		<PageShell>
			<Marketplace
				title="Cakes"
				description="Birthday, wedding, anniversary and bespoke cakes baked to order by verified bakers."
				items={liveItems.length ? liveItems : cakes}
			/>
		</PageShell>
	);
}
