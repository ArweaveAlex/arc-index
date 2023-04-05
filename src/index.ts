import { 
	getPools, 
	PoolType, 
	getPoolCount, 
	TAGS, 
	getTagValue, 
	unquoteJsonKeys 
} from 'arcframework';

import Arweave from 'arweave';

import { WarpFactory, defaultCacheOptions } from 'warp-contracts';

import fs from 'fs';

// const CONTRACT_ID: string | null = 'G2j_YAD1GQcdtXZEwUIE7VDs8Y0UuWx85inKI-kXajY';
const CONTRACT_ID: string | null = 'zkJttC7tFwSi5FwXp2Fd8oRJIutLGh177fHh74p7Xb4';

const WALLET_PATH = 'wallets/wallet.json';

const CONTRACT = fs.readFileSync('./src/contracts/poolIndex.js').toString();

type PoolRatingType = {
	'health': number,
	'activity': number,
	'created': string
}

type PoolIndexStateType = {
	name: string,
	pools: PoolType[],
	owner: string,
	balances: {
		[key: string]: number,
	},
	mostActivePools: PoolType[],
	ratings: {
		[key: string]: PoolRatingType,
	}
}

const GET_ENDPOINT = 'arweave-search.goldsky.com';
// const GET_ENDPOINT = 'arweave.net';

const PORT = 443;
const PROTOCOL = 'https';
const TIMEOUT = 40000;
const LOGGING = false;

let arweaveGet: any = Arweave.init({
	host: GET_ENDPOINT,
	port: PORT,
	protocol: PROTOCOL,
	timeout: TIMEOUT,
	logging: LOGGING,
});

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
		const owner = await arweaveGet.wallets.jwkToAddress(jwk);

		const contractInitState: PoolIndexStateType = {
			name: 'Alex-Pool-Index-v1.0',
			pools: [],
			owner: owner,
			balances: {
				[owner]: 1,
			},
			mostActivePools: [],
			ratings: {}
		};

		// const { contractTxId } = await warp.deploy({
		// 	wallet:  arClient.getNodeSigner(jwk),
		// 	initState: JSON.stringify(contractInitState),
		// 	src: CONTRACT,
		// });

		// console.log(`[ ${contractTxId} ]`);
	} else {
		const indexedPools: PoolType[] = [];
		const pools = await getPools();

		for (let i = 0; i < pools.length; i++) {
			indexedPools.push(pools[i]);
		}

		const contract = warp.contract(CONTRACT_ID).setEvaluationOptions({ allowBigInt: true }).connect(jwk);

		for (let i = 0; i < indexedPools.length; i += 1) {
			// const result = await contract.writeInteraction({
			// 	function: 'add',
			// 	pools: indexedPools.slice(i, i + 1)
			// });
			// console.log(result);

			// let health = await findHealthRating2(pools[i]);
			let health = 100;
			let activity = await findActivityRating(pools[i]);

			let rating: PoolRatingType = {
				'health': health,
				'activity': activity,
				'created': pools[i].state.timestamp
			};

			// const result2 = await contract.writeInteraction({
			// 	function: 'rate',
			// 	rating: {
			// 		[pools[i].id]: rating
			// 	}
			// });
			// console.log(result2);
		}

		const result = await contract.writeInteraction({
			function: 'updateMostActive'
		});

		// console.log(result);
		
	}
})();

async function findHealthRating2(pool: PoolType) {
	// dollar amount of total contributions
	let totalContributions = getTotalContributions(pool);
  
	// integer of data points mined in the last 30 days
	let dataPointsMinedInLastMonth = await getDataPointsMinedInPeriod(pool, 30);
  
	// integer of data points mined since the last contribution
	let dataPointsMinedSinceLastContrib = await getDataPointsLastContribution(pool);
  
	// total data points mined ever
	let totalDataPointsMined = await getTotalDataPointsMined(pool);
  
	
	let health = 100;

	return health;
}

async function findActivityRating(pool: PoolType) : Promise<number> {
	let dataPointsMinedInLastMonth = await getDataPointsMinedInPeriod(pool, 30);
	return dataPointsMinedInLastMonth;
}

async function getDataPointsMinedInPeriod(pool: PoolType, period: number) : Promise<number> {
	let minBlockHeight = await getMinBlockHeightByDays(period);
	
	return 15;
}

async function getMinBlockHeightByDays(period: number) {
	let blockHeightOffset: number;
	let timestampOffset: number;


	// estimate of a period worth of blocks
	blockHeightOffset = period * 24 * 30; // assuming 30 days in a month
	const onePeriodAgo = new Date().getTime() - (period * 24 * 60 * 60 * 1000); 
	timestampOffset = Math.floor(onePeriodAgo / 1000); 

	let currentBlockHeight = await getCurrentBlockHeight();
	let minBlockHeight = currentBlockHeight - blockHeightOffset;
	let blockSpread = 100;
	let periodAgoBlockHeight = 0;

	do {
		const operation = {
			query: `
				query {
						blocks (
							first:${blockSpread}
							sort:HEIGHT_ASC
							height: {
								min: ${minBlockHeight}
							}
						) 
					{
						edges {
							cursor
							node {
								id
								timestamp
								height
								previous
							}
						}
					}
				}
			`,
		};

		await new Promise(resolve => setTimeout(resolve, 2000));
	
		console.log("here");
		const response = await arweaveGet.api.post('/graphql', operation);
		console.log("here2");
		let edges = response.data.data.blocks.edges;
		let earliestBlock = edges[0].node;
		console.log(earliestBlock);
		let earliestTimestamp = earliestBlock.timestamp;
		let range = 3600;

		if(Math.abs(earliestTimestamp - timestampOffset) <= range) {
			periodAgoBlockHeight = earliestTimestamp;
			return periodAgoBlockHeight;
		} else if(earliestTimestamp < timestampOffset) {
			for(let i = 1; i < edges.length; i++){
				let iterTimestamp = edges[i].node.timestamp;
				if(Math.abs(iterTimestamp - timestampOffset) <= range) {
					periodAgoBlockHeight = iterTimestamp;
					return periodAgoBlockHeight;
				}
				if(i == (edges.length - 1)){
					minBlockHeight = edges[i].node.height;
				}
			}
		} else if(earliestTimestamp > timestampOffset) {
			minBlockHeight = minBlockHeight - blockSpread;
		}
	} while(true);
}


async function getCurrentBlockHeight() : Promise<number> {
	let op = {
		query: `
			query {
					blocks 
					(
						first:10
						sort:HEIGHT_DESC
					) 
				{
					edges {
						cursor
						node {
							id
							timestamp
							height
							previous
						}
					
					}
				}
			}
		`
	}
	const topBlockResponse = await arweaveGet.api.post('/graphql', op);
	return topBlockResponse.data.data.blocks.edges[0].node.height;
}

async function getDataPointsLastContribution(pool: PoolType) : Promise<number> {

	return 15;
}

function getTotalContributions(pool: PoolType) : number {
	return parseFloat(arweaveGet.ar.winstonToAr(pool.state.totalContributions));
}

async function getTotalDataPointsMined(pool: PoolType) : Promise<number> {
	let t = [
		{
			name: TAGS.keys.poolId,
			values: [pool.id]
		}
	];

	let tags = unquoteJsonKeys(t);

	const operation = {
		query: `
                query {
                    transactions(
                        tags: ${tags},
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
	if(response.data.data.transactions.edges && (response.data.data.transactions.edges.length > 0)) {
		let nftSrc = getTagValue(response.data.data.transactions.edges[0].node.tags, TAGS.keys.contractSrc);
		let count = await getPoolCount(nftSrc);
		return count;
	} else {
		return 0;
	}
}