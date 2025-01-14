
// Imports:
import { pancakeswap } from '../../ABIs';
import { initResponse, query, addToken, addLPToken } from '../../functions';
import type { Request } from 'express';
import type { Chain, Address, Token, LPToken } from 'cookietrack-types';

// Initializations:
const chain: Chain = 'bsc';
const project = 'pancakeswap';
const registry: Address = '0x73feaa1eE314F8c655E354234017bE2193C9E24E';
const autoCakePool: Address = '0xa80240Eb5d7E05d3F250cF000eEc0891d00b51CC';
const cake: Address = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

/* ========================================================================================================================================================================= */

// GET Function:
exports.get = async (req: Request): Promise<string> => {

  // Initializing Response:
  let response = initResponse(req);

  // Fetching Response Data:
  if(response.status === 'ok') {
    try {
      let wallet = req.query.address as Address;
      response.data.push(...(await getFarmBalances(wallet)));
      response.data.push(...(await getAutoCakePoolBalance(wallet)));
    } catch(err: any) {
      console.error(err);
      response.status = 'error';
      response.data = [{error: 'Internal API Error'}];
    }
  }

  // Returning Response:
  return JSON.stringify(response, null, ' ');
}

/* ========================================================================================================================================================================= */

// Function to get farm balances:
const getFarmBalances = async (wallet: Address) => {
  let balances: (Token | LPToken)[] = [];
  let cakeRewards = 0;
  let poolLength = parseInt(await query(chain, registry, pancakeswap.registryABI, 'poolLength', []));
  let farms = [...Array(poolLength).keys()];
  let promises = farms.map(farmID => (async () => {
    let balance = parseInt((await query(chain, registry, pancakeswap.registryABI, 'userInfo', [farmID, wallet]))[0]);
    if(balance > 0) {
      let token = (await query(chain, registry, pancakeswap.registryABI, 'poolInfo', [farmID]))[0];

      // Single-Asset Cake Farm:
      if(farmID === 0) {
        let newToken = await addToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);

      // All Other Farms:
      } else {
        let newToken = await addLPToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);
      }

      // Pending Cake Rewards:
      let rewards = parseInt(await query(chain, registry, pancakeswap.registryABI, 'pendingCake', [farmID, wallet]));
      if(rewards > 0) {
        cakeRewards += rewards;
      }
    }
  })());
  await Promise.all(promises);
  if(cakeRewards > 0) {
    let newToken = await addToken(chain, project, 'unclaimed', cake, cakeRewards, wallet);
    balances.push(newToken);
  }
  return balances;
}

// Function to get CAKE in auto-compounding pool:
const getAutoCakePoolBalance = async (wallet: Address): Promise<Token[]> => {
  let balance = parseInt((await query(chain, autoCakePool, pancakeswap.autoCakePoolABI, 'userInfo', [wallet]))[0]);
  if(balance > 0) {
    let multiplier = parseInt(await query(chain, autoCakePool, pancakeswap.autoCakePoolABI, 'getPricePerFullShare', [])) / (10 ** 18);
    let actualBalance = balance * multiplier;
    let newToken = await addToken(chain, project, 'staked', cake, actualBalance, wallet);
    return [newToken];
  } else {
    return [];
  }
}