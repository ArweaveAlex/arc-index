'use strict';

async function handle(state, action) {
	if (state.owner !== action.caller) {
		throw new ContractError('Only the owner can update the state of this contract');
	}

	const index = state.pools.findIndex((pool) => pool.id === action.input.pool.id);
	switch (action.input.function) {
		case 'add':
			if (index === -1) {
				state.pools = [...state.pools, action.input.pool];
			}
			return { state };
		case 'update':
			if (index !== -1) {
				state.pools[index] = action.input.pool;
			}
			return { state };
		default:
			throw new ContractError('Action does not exist');
	}
}
