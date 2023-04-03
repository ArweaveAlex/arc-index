import fs from 'fs';

import { getPools, PoolType, ArweaveClient } from 'arcframework';

const CONTRACT_ID: string | null = 'G2j_YAD1GQcdtXZEwUIE7VDs8Y0UuWx85inKI-kXajY';
const WALLET_PATH = 'wallets/wallet.json';

const CONTRACT = fs.readFileSync("./src/contracts/poolIndex.js").toString();

(async () => {
	const arClient = new ArweaveClient();

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
		const owner = await arClient.arweaveGet.wallets.jwkToAddress(jwk);

		const contractInitState = {
			name: 'Alex-Pool-Index-v1.0',
			pools: [],
			owner: owner,
			balances: {
				[owner]: 1,
			},
		};

		const { contractTxId } = await arClient.warp.deploy({
			wallet: jwk,
			initState: JSON.stringify(contractInitState),
			src: CONTRACT,
		});

		console.log(`[ ${contractTxId} ]`);
	} else {
		const indexedPools: PoolType[] = [];
		const pools = await getPools();

		for (let i = 0; i < pools.length; i++) {
			indexedPools.push(pools[i]);
		}

		const contract = arClient.warp.contract(CONTRACT_ID).setEvaluationOptions({ allowBigInt: true }).connect(jwk);

		for (let i = 0; i < indexedPools.length; i += 1) {
			const result = await contract.writeInteraction({
				function: 'add',
				pools: indexedPools.slice(i, i + 1),
			});
			console.log(result);
		}
	}
})();
