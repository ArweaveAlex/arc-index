import * as ArcFramework from 'arcframework';

import { PoolIndexActionType } from '../helpers/types';

import fs from 'fs';
import path from 'path';

const CONTRACT = fs.readFileSync(path.resolve(__dirname, '..', 'contracts', 'pool-index.js')).toString();
const WALLET_PATH = path.resolve(__dirname, '..', '..', 'wallets', 'wallet.json');

export async function indexPools(action: PoolIndexActionType) {
	const arClient = new ArcFramework.ArweaveClient();

	let jwk: any;
	if (!fs.existsSync(WALLET_PATH)) {
		console.log('Wallet does not exist');
		process.exit();
	} else {
		jwk = JSON.parse(fs.readFileSync(WALLET_PATH).toString());
	}

	switch (action) {
		case 'create':
			console.log('Creating Pool Index ...');

			const owner = await arClient.arweaveGet.wallets.jwkToAddress(jwk);

			const contractInitState = {
				name: ArcFramework.TAGS.values.poolIndex,
				pools: [],
				owner: owner,
				balances: {
					[owner]: 1,
				},
			};

			const { contractTxId } = await arClient.warpDefault.deploy({
				wallet: arClient.warpPluginArweaveSigner(jwk),
				initState: JSON.stringify(contractInitState),
				src: CONTRACT,
			});

			console.log(`Pool Index: [${contractTxId}]`);
			return;

		case 'update':
			console.log('Updating Pool Index ...');

			const fetchedPools: ArcFramework.PoolType[] = [];
			const poolIds = [];
			let nextCursor = null;
			do {
				const pools = await ArcFramework.getGQLData({
					ids: null,
					tagFilters: [
						{
							name: ArcFramework.TAGS.keys.appType,
							values: [
								ArcFramework.TAGS.values.poolVersions['1.2'],
								ArcFramework.TAGS.values.poolVersions['1.4'],
								ArcFramework.TAGS.values.poolVersions['1.5'],
							],
						},
					],
					uploaders: null,
					cursor: nextCursor,
					reduxCursor: null,
					cursorObject: 'gql' as ArcFramework.CursorObjectKeyType,
					useArweavePost: true,
				});

				const fetchedIds = pools.data.map((pool) => {
					switch (ArcFramework.getTagValue(pool.node.tags, ArcFramework.TAGS.keys.appType)) {
						case 'Alex-Archiving-Pool-Thread-Testing-v1.0':
							return pool.node.id;
						case ArcFramework.TAGS.values.poolVersions['1.2']:
							return pool.node.id;
						case ArcFramework.TAGS.values.poolVersions['1.4']:
							return ArcFramework.getTagValue(pool.node.tags, ArcFramework.TAGS.keys.uploaderTxId);
						default:
							const uploaderTxId = ArcFramework.getTagValue(pool.node.tags, ArcFramework.TAGS.keys.uploaderTxId);
							return uploaderTxId === ArcFramework.STORAGE.none ? pool.node.id : uploaderTxId;
					}
				});

				poolIds.push(...fetchedIds);
				nextCursor = pools.nextCursor;
			} while (nextCursor && nextCursor !== ArcFramework.CURSORS.end);

			for (let i = 0; i < poolIds.length; i++) {
				if (poolIds[i]) {
					await new Promise((r) => setTimeout(r, 1000));
					try {
						const contract = arClient.warpDefault.contract(poolIds[i]).setEvaluationOptions({
							allowBigInt: true,
						});
						try {
							const state = ((await contract.readState()) as any).cachedValue.state;
							console.log(state);

							fetchedPools.push({ id: poolIds[i], state: state });
						} catch (error: any) {
							console.error(error);
						}
					} catch (error: any) {
						console.error(error);
					}
				}
			}

			const existingPools: ArcFramework.PoolIndexType[] = await ArcFramework.getIndexPools();

			const indexContract = arClient.warpDefault
				.contract(ArcFramework.POOL_INDEX_CONTRACT_ID)
				.setEvaluationOptions({ allowBigInt: true })
				.connect(jwk);

			for (let i = 0; i < fetchedPools.length; i++) {
				const existingPool = existingPools.find((pool: ArcFramework.PoolIndexType) => pool.id === fetchedPools[i].id);

				if (!existingPool || existingPool.state.totalContributions !== fetchedPools[i].state.totalContributions) {
					await new Promise((r) => setTimeout(r, 1000));
					try {
						await indexContract.writeInteraction({
							function: !existingPool ? 'add' : 'update',
							pool: {
								id: fetchedPools[i].id,
								state: {
									image: fetchedPools[i].state.image,
									ownerMaintained: fetchedPools[i].state.ownerMaintained
										? fetchedPools[i].state.ownerMaintained
										: false,
									timestamp: fetchedPools[i].state.timestamp,
									title: fetchedPools[i].state.title,
									topics: fetchedPools[i].state.topics ? fetchedPools[i].state.topics : [],
									totalContributions: fetchedPools[i].state.totalContributions,
								},
							},
						});
						console.log(`Pool [${fetchedPools[i].id}] updated in index (Count: ${i + 1})`);
					} catch (e: any) {
						console.error(e);
					}
				}
			}
			return;
		default:
			return;
	}
}
