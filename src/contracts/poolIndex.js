'use strict';

function calcMostActive(state) {
	let mostActivePools = [];
	for (let i = 0; i < state.pools.length; i += 1) {
		const poolId = state.pools[i].id;
		if (state.ratings[poolId] && state.ratings[poolId].activity) {
			const activityRating = state.ratings[poolId].activity;
			mostActivePools.push({ id: poolId, activity: activityRating });
		}
	}
	mostActivePools.sort((a, b) => b.activity - a.activity);
	mostActivePools = mostActivePools.slice(0, 5).map(pool => pool.id);
	return mostActivePools;
}

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
				const existingPool = pools.find((pool) => pool.id === currentPool.id);
				if (!existingPool) {
					return pools.concat([currentPool]);
				} else {
					if (existingPool.state.totalContributions !== currentPool.state.totalContributions) {
						const index = pools.findIndex((pool) => pool.id === existingPool.id);
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
		case 'rate': {
			if (state.owner !== caller) {
				throw new ContractError('Only the owner can update this contracts state.');
			}

			const inputRating = input.rating;

			let keys = Object.keys(inputRating);

			if(keys.length != 1) {
				throw new ContractError('Can only rate one pool at a time.');
			}

			let poolId = keys[0];

			state.ratings[poolId] = inputRating[poolId];
			
			return { state };
		}
		case 'updateMostActive': {
			if (state.owner !== caller) {
				throw new ContractError('Only the owner can update this contracts state.');
			}

			const mostActive = calcMostActive(state);

			state.mostActivePools = mostActive;
			
			return { state };
		}
		default: {
			throw new ContractError('Action does not exist');
		}
	}
}
