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