import { PoolIndexActionType } from './helpers/types';
import { indexPools } from './workers/index-pools';

(async function () {
	switch (process.argv[2]) {
		case 'index-pools':
			await indexPools(process.argv[3] as PoolIndexActionType);
			return;
		default:
			return;
	}
})();
