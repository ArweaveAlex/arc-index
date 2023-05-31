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

			const existingPools: ArcFramework.PoolIndexType[] = await ArcFramework.getIndexPools();
			const fetchedPools: ArcFramework.PoolType[] = await ArcFramework.getPools();

			const indexContract = arClient.warpDefault
				.contract(ArcFramework.POOL_INDEX_CONTRACT_ID)
				.setEvaluationOptions({ allowBigInt: true })
				.connect(jwk);

			for (let i = 0; i < fetchedPools.length; i++) {
				const existingPool = existingPools.find((pool: ArcFramework.PoolIndexType) => pool.id === fetchedPools[i].id);

				if (!existingPool || existingPool.state.totalContributions !== fetchedPools[i].state.totalContributions) {
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
