import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { snacks } from "@/lib/data";
import { getProductsByType } from "@/lib/savora-api";

export default async function Page() {
	const liveItems = await getProductsByType("SNACK");

	return (
		<PageShell>
			<Marketplace
				title="Snacks"
				description="Small chops, meat pies, puff puff, chin chin and pastries — party ready."
				items={liveItems.length ? liveItems : snacks}
			/>
		</PageShell>
	);
}
