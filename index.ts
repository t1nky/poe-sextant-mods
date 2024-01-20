import * as path from "path";
import { write } from "bun";
import {
	SCHEMA_URL,
	SCHEMA_VERSION,
	type SchemaFile,
} from "pathofexile-dat-schema";
import type { ExportConfig } from "./lib/ExportConfig";
import * as loaders from "./lib/bundle-loaders";
import { readDatFile } from "./lib/dat/dat-file";
import type { Scalar } from "./lib/dat/reader";
import { exportAllRows, importHeaders } from "./lib/export-tables";
import { getLastPatch } from "./lib/get-patch";

(async function main() {
	const lastPatch = await getLastPatch();

	const loader = await loaders.FileLoader.create(
		await loaders.CdnBundleLoader.create(
			path.join(process.cwd(), "/.cache"),
			lastPatch,
		),
	);

	const tables = await exportTables(
		{
			tables: [
				{
					name: "Mods",
					columns: [
						"Id",
						"Name",
						"StatsKey2",
						"StatsKey1",
						"StatsKey3",
						"StatsKey4",
						"Domain",
						"Families",
						"Stat1Min",
						"Stat1Max",
						"Stat2Min",
						"Stat2Max",
						"Stat3Min",
						"Stat3Max",
						"Stat4Min",
						"Stat4Max",
						"SpawnWeight_TagsKeys",
						"SpawnWeight_Values",
					],
				},
				{
					name: "Stats",
					columns: ["Id"],
				},
				{
					name: "ModFamily",
					columns: ["Id"],
				},
			],
		},
		loader,
	);

	console.log(tables);
})();

async function exportTables(
	config: Pick<ExportConfig, "tables" | "translations">,
	loader: loaders.FileLoader,
) {
	if (!config.tables?.length) return;

	console.log("Loading schema for dat files");
	const schema = (await (await fetch(SCHEMA_URL)).json()) as SchemaFile;
	if (schema.version !== SCHEMA_VERSION) {
		throw new Error(
			'Schema has format not compatible with this package. Check for "pathofexile-dat" updates.',
		);
	}

	loader.clearBundleCache();
	const result: Record<string, ReturnType<typeof exportAllRows>> = {};
	for (const target of config.tables) {
		console.log(`Exporting table "Data/${target.name}"`);
		const datFile = readDatFile(
			".dat64",
			await loader.getFileContents(`Data/${target.name}.dat64`),
		);
		const headers = importHeaders(schema, target.name, datFile).filter((hdr) =>
			target.columns.includes(hdr.name),
		);

		for (const column of target.columns) {
			if (!headers.some((hdr) => hdr.name === column)) {
				throw new Error(
					`Table "${target.name}" doesn't have a column named "${column}".`,
				);
			}
		}

		result[target.name] = exportAllRows(headers, datFile);
	}

	const stats = result.Stats;
	if (!stats) throw new Error("Stats table not found");
	const sextantMods = result.Mods.reduce(
		(acc, mod) => {
			// ATLAS ModDomain
			if (mod.Domain !== 11) {
				return acc;
			}

			const tags = mod.SpawnWeight_TagsKeys;
			if (!tags || typeof tags !== "object") return acc;
			const spawnWeights = mod.SpawnWeight_Values;
			if (!spawnWeights || typeof spawnWeights !== "object") return acc;

			const weightIndex = tags.findIndex((tag) => tag === 0);
			if (weightIndex === -1) return acc;
			try {
				acc.push({
					id: mod.Id,
					name: mod.Name,
					weight: spawnWeights[weightIndex],
					stats: [1, 2, 3, 4].map((i) => {
						const statId = mod[`StatsKey${i}`];
						if (!statId) return null;
						// biome-ignore lint/style/noNonNullAssertion: <explanation>
						const stat = stats.find((s) => s._index === statId)!;
						return {
							id: stat.Id,
							// biome-ignore lint/style/noNonNullAssertion: <explanation>
							min: mod[`Stat${i}Min`]!,
							// biome-ignore lint/style/noNonNullAssertion: <explanation>
							max: mod[`Stat${i}Max`]!,
						};
					}),
				});
			} catch (e) {
				console.error(e, mod);
			}

			return acc;
		},
		[] as {
			id: Scalar | Scalar[];
			name: Scalar | Scalar[];
			weight: Scalar | Scalar[] | undefined;
			stats: (null | {
				id: Scalar | Scalar[];
				min: Scalar | Scalar[];
				max: Scalar | Scalar[];
			})[];
		}[],
	);

	write("mods.json", JSON.stringify(sextantMods, null, 2));
}

// + file stat_descriptions.txt
// + parse that file
// stat index -> stat id -> stat text from txt file (stat_descriptions.txt)
