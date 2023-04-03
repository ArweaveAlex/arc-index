import Arweave from 'arweave';
import fs from 'fs';
import { defaultCacheOptions, WarpFactory } from 'warp-contracts';

const CONTRACT_ID: string | null = 'G2j_YAD1GQcdtXZEwUIE7VDs8Y0UuWx85inKI-kXajY';
const WALLET_PATH = 'wallets/wallet.json';

const CONTRACT = `
'use strict';
async function handle(state, action) {
	const input = action.input;
	const caller = action.caller;
	switch (action.input.function) {
		case 'add': {
			if (state.owner !== caller) {
				throw new ContractError('Only the owner can update this contracts state.');
			}

			const existingPools = state.pools;
			const inputPools = input.pools;

			const mergedPools = [...existingPools, ...inputPools];

			const finalPools = mergedPools.reduce((pools, currentPool) => {
				const existingPool = pools.find(pool => pool.id === currentPool.id);
				if (!existingPool) {
					return pools.concat([currentPool]);
				} else {
					if (existingPool.state.totalContributions !== currentPool.state.totalContributions) {
						const index = pools.findIndex(pool => pool.id === existingPool.id);
						if (index !== -1) {
							pools[index] = currentPool;
						}
					}
					return pools;
				}
			}, []);

			state.pools = finalPools;
			return { state };
		}
		default: {
			throw new ContractError('Action does not exist');
		}
	}
}
`;

export const TAGS = {
	keys: {
		alexPoolId: 'Alex-Pool-Id',
		ansTitle: 'Title',
		ansDescription: 'Description',
		ansTopic: 'Topic',
		ansType: 'Type',
		ansImplements: 'Implements',
		appType: 'App-Type',
		artifactName: 'Artifact-Name',
		artifactType: 'Artifact-Type',
		associationId: 'Association-Id',
		associationSequence: 'Association-Sequence',
		childAssets: 'Child-Assets',
		bookmarkIds: 'Bookmark-Ids-Tag',
		bookmarkSearch: 'Alex-Bookmark-Search',
		dateCreated: 'Date-Created',
		keywords: 'Keywords',
		initialOwner: 'Initial-Owner',
		poolId: 'Pool-Id',
		profileImage: 'Profile-Image',
		uploaderTxId: 'Uploader-Tx-Id',
		contractSrc: 'Contract-Src',
		mediaIds: 'Media-Ids',
		timestamp: 'Timestamp',
		collectionName: 'Collection-Name',
		collectionDescription: 'Collection-Description',
	},
	values: {
		defaultArtifactType: 'Alex-Default',
		messagingArtifactType: 'Alex-Messaging',
		nostrEventArtifactType: 'Alex-Nostr-Event',
		redditThreadArtifactType: 'Alex-Reddit-Thread',
		webpageArtifactType: 'Alex-Webpage',
		poolVersions: {
			'1.2': 'Alex-Archiving-Pool-v1.2',
			'1.4': 'Alex-Archiving-Pool-v1.4',
			'1.5': 'Alex-Archiving-Pool-v1.5',
		},
		searchIndex: 'Alex-Search-Index-v0',
		collectionAppType: 'Alex-Collection-v0',
		ansVersion: 'ANS-110',
		ansType: 'token',
	},
};

export type KeyValueType = { [key: string]: string };
export type TagFilterType = { name: string; values: string[] };
export type CursorObjectKeyType = null;

export type GQLResponseType = {
	cursor: string | null;
	node: {
		id: string;
		tags: KeyValueType[];
		data: {
			size: string;
			type: string;
		};
	};
};

export interface PoolType {
	id: string;
	state: PoolStateType;
}

export interface PoolStateType {
	title: string;
	image: string;
	briefDescription: string;
	description: string;
	link: string;
	owner: string;
	ownerInfo: string;
	timestamp: string;
	contributors: { [key: string]: string };
	tokens: { [key: string]: string };
	totalContributions: string;
	totalSupply: string;
	balance: string;
}

export function getTagValue(list: KeyValueType[], name: string): string {
	for (let i = 0; i < list.length; i++) {
		if (list[i]) {
			if (list[i]!.name === name) {
				return list[i]!.value as string;
			}
		}
	}
	return 'N/A';
}

export function unquoteJsonKeys(json: Object): string {
	return JSON.stringify(json).replace(/"([^"]+)":/g, '$1:');
}

export async function getGQLData(args: {
	ids: string[] | null;
	tagFilters: TagFilterType[] | null;
	uploader: string | null;
	cursor: string | null;
	reduxCursor: string | null;
	cursorObject: CursorObjectKeyType;
}): Promise<GQLResponseType[]> {
	const data: GQLResponseType[] = [];

	const GET_ENDPOINT = 'arweave-search.goldsky.com';

	const PORT = 443;
	const PROTOCOL = 'https';
	const TIMEOUT = 40000;
	const LOGGING = false;

	const arweaveGet: any = Arweave.init({
		host: GET_ENDPOINT,
		port: PORT,
		protocol: PROTOCOL,
		timeout: TIMEOUT,
		logging: LOGGING,
	});

	if (args.ids && args.ids.length <= 0) {
		return data;
	}

	let ids = args.ids ? JSON.stringify(args.ids) : null;
	let tags = args.tagFilters ? unquoteJsonKeys(args.tagFilters) : null;
	let owners = args.uploader ? JSON.stringify([args.uploader]) : null;

	let cursor = args.cursor ? `"${args.cursor}"` : null;

	const operation = {
		query: `
                query {
                    transactions(
                        ids: ${ids},
                        tags: ${tags},
                        owners: ${owners},
                        first: 100, 
                        after: ${cursor}
                    ){
                    edges {
                        cursor
                        node {
                            id
                            tags {
                                name 
                                value 
                            }
                            data {
                                size
                                type
                            }
                        }
                    }
                }
            }
        `,
	};

	const response = await arweaveGet.api.post('/graphql', operation);
	if (response.data.data) {
		const responseData = response.data.data.transactions.edges;
		if (responseData.length > 0) {
			data.push(...responseData);
		}
	}

	return data;
}

export async function getPoolIds() {
	const pools: GQLResponseType[] = await getGQLData({
		ids: null,
		tagFilters: [
			{
				name: TAGS.keys.appType,
				values: [TAGS.values.poolVersions['1.2'], TAGS.values.poolVersions['1.4'], TAGS.values.poolVersions['1.5']],
			},
		],
		uploader: null,
		cursor: null,
		reduxCursor: null,
		cursorObject: null,
	});

	return pools.map((pool: GQLResponseType) => {
		switch (getTagValue(pool.node.tags, TAGS.keys.appType)) {
			case TAGS.values.poolVersions['1.2']:
				return pool.node.id;
			case TAGS.values.poolVersions['1.4']:
				return getTagValue(pool.node.tags, TAGS.keys.uploaderTxId);
			default:
				return getTagValue(pool.node.tags, TAGS.keys.uploaderTxId);
		}
	});
}

export async function getPools(warp: any): Promise<PoolType[]> {
	const pools: PoolType[] = [];
	const poolIds = await getPoolIds();
	console.log(poolIds);

	for (let i = 0; i < poolIds.length; i++) {
		if (poolIds[i]) {
			try {
				const contract = warp.contract(poolIds[i]).setEvaluationOptions({ allowBigInt: true });
				try {
					pools.push({ id: poolIds[i], state: ((await contract.readState()) as any).cachedValue.state });
				} catch (error: any) {
					console.error(error);
				}
			} catch (error: any) {
				console.error(error);
			}
		}
	}

	return pools;
}

(async () => {
	const warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });
	let jwk: any;
	if (process.env.ALEX_DEPLOY_KEY) {
		jwk = JSON.parse(Buffer.from(process.env.ALEX_DEPLOY_KEY, 'base64').toString('utf-8'));
	} else {
		if (!fs.existsSync(WALLET_PATH)) {
			console.log('Wallet does not exist');
			process.exit();
		} else {
			jwk = JSON.parse(fs.readFileSync(WALLET_PATH).toString());
		}
	}

	if (!CONTRACT_ID) {
		const GET_ENDPOINT = 'arweave.net';

		const PORT = 443;
		const PROTOCOL = 'https';
		const TIMEOUT = 40000;
		const LOGGING = false;

		const arweaveGet: any = Arweave.init({
			host: GET_ENDPOINT,
			port: PORT,
			protocol: PROTOCOL,
			timeout: TIMEOUT,
			logging: LOGGING,
		});

		const owner = await arweaveGet.wallets.jwkToAddress(jwk);

		const contractInitState = {
			name: 'Alex-Pool-Index-v1.0',
			pools: [],
			owner: owner,
			balances: {
				[owner]: 1,
			},
		};

		const { contractTxId } = await warp.deploy({
			wallet: jwk,
			initState: JSON.stringify(contractInitState),
			src: CONTRACT,
		});

		console.log(`[ ${contractTxId} ]`);
	} else {
		const indexedPools: PoolType[] = [];
		const pools = await getPools(warp);

		for (let i = 0; i < pools.length; i++) {
			indexedPools.push(pools[i]);
		}

		const contract = warp.contract(CONTRACT_ID).setEvaluationOptions({ allowBigInt: true }).connect(jwk);

		for (let i = 0; i < indexedPools.length; i += 1) {
			const result = await contract.writeInteraction({
				function: 'add',
				pools: indexedPools.slice(i, i + 1),
			});
			console.log(result);
		}
	}
})();
